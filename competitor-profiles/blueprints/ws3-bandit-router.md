# WS-3 Blueprint — Online Contextual Bandit on the OCR Signal

## Key unlock

**`ThompsonSamplingBandit` already exists in `NadirClaw/nadirclaw/ocr.py:684`** with NIG (Normal-Inverse-Gamma) posteriors and `compute_cos` reward formula. We **import** it from `nadirclaw.ocr`, not reimplement. The unique Pro layer is multi-tenant Postgres persistence + per-`(api_key_id, cluster_id)` scoping.

## Bandit math (locked)

- **Posterior**: NIG (Normal-Inverse-Gamma) contextual Bayesian linear regression — quality is a continuous COS in [0,1], not a binary success, so Beta-Bernoulli is wrong.
- **Reward** (matches `compute_cos` in `ocr.py:87`):
  ```
  R = 0.50*quality + 0.25*sigmoid((expected_lat - actual_lat)/expected_lat)
              + 0.25*sigmoid((expected_cost - actual_cost)/expected_cost)
  ```
- **Default weights**: `w_q=0.50, w_c=0.25, w_l=0.25`. Customer override via `model_parameters.bandit.weights`.
- **Sampling**: Thompson (UCB needs known upper bound that doesn't exist for non-stationary COS).
- **Cold start**: `n_cold=20` per `(api_key, cluster_id)`. Below threshold → classifier argmax fallback.
- **Decay**: γ=0.99 daily (matches weekly drift rate for API workloads better than γ=0.98 daily).

## Data model

New table `routing_arms`:
```sql
CREATE TABLE routing_arms (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    api_key_id uuid NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
    cluster_id text NOT NULL,
    arm_model text NOT NULL,
    mu float8[] NOT NULL,
    lambda_diag float8[] NOT NULL,    -- diagonal until n>20, then full
    alpha float8 NOT NULL DEFAULT 2.0,
    beta float8 NOT NULL DEFAULT 1.0,
    n_obs integer NOT NULL DEFAULT 0,
    last_updated timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (api_key_id, cluster_id, arm_model)
);
CREATE INDEX routing_arms_lookup_idx ON routing_arms (api_key_id, cluster_id);
```

- **Not Redis**: Postgres with row-level locking handles concurrent writes. Bandit state for one key fits in a few KB.
- **Not jsonb in profiles**: Per-request mutability requires atomic per-arm updates; jsonb blob would collide.
- **Cluster ID**: reuse `gemini_clustering_cache` (similarity 0.85), SHA-256 of nearest-centroid embedding truncated to 16 hex.
- **Cluster miss** → `cluster_id="global"` namespace.
- **In-memory LRU**: 60-second TTL keyed by `(api_key_id, cluster_id)`. Invalidate on write.

## Code structure

### `backend/app/services/bandit_router.py` (NEW)

```python
class BanditArmState:
    api_key_id, cluster_id, arm_model
    mu: np.ndarray
    Lambda: np.ndarray
    alpha, beta: float
    n_obs: int

class BanditRouter:
    select(api_key_id, cluster_id, candidate_arms, context_vec, n_cold=20)
        -> (arm_model, is_bandit_active, meta)
    update(api_key_id, cluster_id, arm_model, context_vec, reward) -> None
    _load_arms(api_key_id, cluster_id) -> Dict[str, BanditArmState]
    _save_arm(state) -> None
    _build_context_vector(r_hat, prompt_len, domain_hint, ts) -> np.ndarray
    _compute_reward(quality, actual_cost, expected_cost, actual_lat, expected_lat, weights) -> float
    _decay_arms(api_key_id, cluster_id, gamma=0.99) -> None
```

Imports `ThompsonSamplingBandit` from `nadirclaw.ocr`. No new math.

### Integration in `production_completion.py`

Insertion at ~line 856 (after tier mapping, before fallback resolution):

```python
if layer_routing and bandit_enabled:
    cluster_id = complexity_analysis_result.get("cluster_id", "global")
    candidates = _get_bandit_candidates(tier_name, user_config)
    bandit_model, bandit_active, bandit_meta = await bandit_router.select(
        api_key_id=str(current_user.api_key_id),
        cluster_id=cluster_id,
        candidate_arms=candidates,
        r_hat=complexity_score,
        prompt_len=len(prompt),
    )
    if bandit_active:
        recommended_model = bandit_model
        complexity_analysis_result["bandit_selected"] = True
```

### Async reward update in `supabase_unified_llm_service.py:_background_processing()`

After existing analytics log, fire `_safe_background_task(bandit_router.update(...))`.

### Per-key opt-in

`model_parameters.bandit.enabled` (bool, default false during rollout). `model_parameters` is already jsonb additive (no migration per CLAUDE.md).

## Safety rails

1. **High-spend cap (>$1k/mo)**: Same-tier-only candidates. Cross-tier exploration disabled.
2. **Cost-delta alarm**: Extend `cost_anomaly_service.py` with `get_bandit_cost_delta()`. Alert at >15% delta.
3. **OCR confidence floor**: Only update posterior when `meta.classifier_confidence > 0.7`. Selection still proceeds.
4. **Sparse cluster (n<10)**: Hierarchical prior collapse to `cluster_id="global"` posterior for same api_key.

## 4-phase rollout

1. **Shadow (W1-2)**: Select but don't override. Log paired (bandit, classifier) decisions for offline eval.
2. **Canary (W3)**: One internal beta API key. Monitor cost delta, error rate.
3. **Opt-in beta (W4-5)**: Dashboard toggle. Target 10-20 users, 2000+ active requests per cluster.
4. **Default-on (W6+)**: Flip `BANDIT_ENABLED_DEFAULT=true`.

## Risk register (top 5)

1. **Posterior poisoning from low-quality OCR signals** — LLM-as-judge path provides delayed quality; confidence floor (0.7) filters.
2. **Concurrent write conflicts on high-traffic keys** — optimistic upsert with WHERE on n_obs; switch to Celery queue at >10% conflict rate.
3. **Cold-start regression for many-cluster accounts** — global cluster fallback inherits learned priors.
4. **Exploration cost overshoot for budget accounts** — add `bandit.max_tier_step=1` (configurable, default 1).
5. **User-preference drift slow to un-learn** — expose `POST /v1/bandit/reset` endpoint + dashboard button.

## Files

NEW: `bandit_router.py`, `bandit_state_cache.py`, `migrations/routing_arms_table.sql`, `migrations/bandit_reward_log_table.sql`, `test_bandit_router.py`, `test_bandit_simulation.py`
MODIFY: `production_completion.py`, `supabase_unified_llm_service.py`, `cost_anomaly_service.py`, `routing_quality_tracker.py`, `settings.py`, `requirements.txt`

---

## Reviewer must-fixes (applied 2026-05-23)

1. **SQL upsert is silently broken as written.** `WHERE n_obs = excluded.n_obs - 1` resolves to `excluded.n_obs - 1 = excluded.n_obs - 1` (always true). Conflict detection never fires. **Fix**:
   ```sql
   ON CONFLICT (api_key_id, cluster_id, arm_model)
   DO UPDATE SET n_obs = routing_arms.n_obs + 1, mu = EXCLUDED.mu, lambda = EXCLUDED.lambda, ...
   WHERE routing_arms.n_obs = EXCLUDED.n_obs - 1
   ```
   The qualifier `routing_arms.n_obs` is the stored value. Write a Postgres-level test that fires two concurrent updates and verifies exactly one wins.
2. **NIG defense rewrite**: quality in `compute_cos` (`ocr.py:101`) is binary 0/1, not continuous. The actual justification for NIG: **conjugate prior for Bayesian linear regression with Gaussian likelihood**. COS is a noisy linear function of the context vector (r_hat, prompt_len, domain_hint, ts). Beta-Bernoulli is a marginal model for scalar Bernoulli; it cannot represent context-dependence. Update blueprint section "Bandit math".
3. **ThompsonSamplingBandit is memory-only with `threading.Lock`.** Add `nadirclaw>=0.13.0` (or whatever release introduced it) to `backend/requirements.txt`. Restructure narrative: BanditRouter does NOT instantiate one long-lived `ThompsonSamplingBandit`; it reconstructs per-LRU-miss from DB state and uses `ThompsonSamplingBandit.update()` only as a math kernel. Document the 4-worker divergence as a known approximation: effective sample size per posterior is ~25% of actual traffic during the 60s LRU window.
4. **Full Lambda from n=1**, not "diagonal until n>20 then full". Schema becomes `lambda_matrix float8[][]` (or store lower triangle as flat array). 64 floats per arm is negligible storage. Diagonal-then-full discards rank-1 outer-product mass during the highest-information phase.
5. **Dedup schema for reward updates**: add `bandit_reward_log(request_id, update_source, rewarded_at)` table OR `bandit_reward_count integer DEFAULT 0` + `last_rewarded_at timestamptz` on `routing_arms`. The periodic `update_bandit_rewards_from_overrides()` job MUST check this before writing; otherwise overridden requests get double-updated (immediate quality=1.0, later quality=0.0).
6. **High-spend cap gradient**: replace cliff at $1k with linear suppression: `p_cross_tier = max(0, 1 - spend_usd / 1000)`. Avoids arbitrage incentive.
7. **OCR confidence floor: 20th-percentile, not 0.7**: pull histogram of `classifier_confidence` from `usage_logs` metadata for the last 30 days. Set the floor at the 20th percentile. If most observations are below 0.7 today, the bandit posteriors grow too slowly.
8. **Cluster ID multi-worker coherence**: `gemini_clustering_cache` is pickle-backed per-process. Workers can assign different cluster_ids to identical prompts. Either centralize cluster assignment behind a single Celery task or document as known approximation and size the `cluster_id="global"` fallback to absorb fragmentation.

Effort recalibrated: **8-10 engineer-weeks single engineer** (was 4-6). Split into two milestones:
- **Milestone A (4 weeks)**: bandit math + persistence + tests working on single-worker dev.
- **Milestone B (4-6 weeks)**: production-hardened multi-worker, shadow → canary → opt-in beta rollout, dashboard toggle, reset endpoint, cost-delta alarm extension.
