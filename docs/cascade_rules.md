# Cascade Rules — configurable routing policy per workload

**Pro feature.** Nadir's cascade escalation logic is the only one in the LLM
gateway market that's configurable per customer without code changes or
re-deploys. Ship your own rule pack. Audit which rules matched per request.

---

## What it is

The cascade rule engine sits in front of Nadir's verifier-gated cascade. For
every incoming request it evaluates a list of declarative rules against the
prompt and emits one of three decisions:

| Action | Effect |
|---|---|
| `force_escalate` | Skip the cheap-model attempt; go straight to the expensive tier (e.g. Opus). |
| `set_threshold`  | Raise the verifier's acceptance threshold for this request (we never lower it). |
| `force_cheap`    | Override a legacy force-escalate pattern and keep the cheap tier. Used for trivially-easy patterns where you want to claw back cost. |

Rules live in YAML files on disk and reload automatically — no redeploy, no
restart. Operators can ship a profile per customer or per workload.

## How it's positioned

Most LLM gateways frame "routing policy" as choosing between providers
(OpenAI vs Anthropic vs Bedrock). That's a different abstraction layer.
Nadir's cascade rules operate on the **escalation decision inside a single
provider's model family**: when do we trust the trained classifier, when do
we override it, and when do we raise the verifier's bar?

| | Portkey config rules | Nadir cascade rules |
|---|---|---|
| Layer | Provider selection (which API to hit) | Tier escalation (which model in the cascade) |
| Decides | Which API receives the request | Whether to escalate past the cheap-model attempt |
| Signals available | Headers, region, model name | Prompt text, classifier confidence, predicted tier, prompt length |
| Co-exists with | Static fallback chains | Trained classifier + verifier |
| Live reload | Config redeploy | YAML file mtime, ~30s TTL |

## Schema

```yaml
- name: code_blocks_force_opus       # required, unique within the profile
  priority: 100                      # higher = evaluated first
  match:
    any_of:                          # OR over the listed conditions
      - substring: "```python"
      - regex: "\\bdef\\s+\\w+\\("
      - prompt_length_min: 4000
      - classifier_confidence_max: 0.5
  applies_when:                      # optional pre-filter
    tier_predicted_in: [simple, medium]
  action:
    type: force_escalate             # | set_threshold | force_cheap
    to_tier: complex                 # for force_escalate / force_cheap
    threshold: 0.85                  # for set_threshold
  meta:                              # optional, surfaced in audit log
    rationale: "Code blocks need stepwise reasoning"
    owner: "platform-routing@example.com"
```

### Condition types

| Condition | Meaning |
|---|---|
| `substring` | Case-insensitive substring match. |
| `regex` | Python regex applied case-sensitively. Use `(?i)` for case-insensitive. |
| `prompt_length_min` | Prompt char-length is at least N. |
| `prompt_length_max` | Prompt char-length is at most N. |
| `classifier_confidence_min` | Classifier confidence is at least V (0.0–1.0). |
| `classifier_confidence_max` | Classifier confidence is at most V. |

Conditions inside `match.any_of` are ORed. Multiple rules can fire on the
same request:

- The highest-priority `force_escalate` / `force_cheap` rule wins for that
  channel.
- All matched `set_threshold` rules stack — the strictest wins.
- Every matched rule name lands in `meta.matched_rules` for audit.

## Activating a profile

There are two ways to attach rules to a tenant.

**Named profile** — point a customer's user row at a YAML file on disk:

```sql
update public.profiles
set model_parameters = jsonb_set(
  model_parameters,
  '{cascade,rules_profile}',
  '"customer_a_v1"'
)
where id = '...';
```

The engine resolves `backend/app/services/cascade_rules/profiles/customer_a_v1.yaml`.

**Inline rules** — carry a rule list on the user row, no file needed:

```sql
update public.profiles
set model_parameters = jsonb_set(
  model_parameters,
  '{cascade,rules_inline}',
  '[
    {"name": "phi_force_opus", "priority": 200,
     "match": {"any_of": [{"substring": "patient_id"}, {"substring": "diagnosis code"}]},
     "action": {"type": "force_escalate", "to_tier": "complex"},
     "meta": {"rationale": "PHI routes to highest-quality tier; compliance team approved 2026-04-12"}}
  ]'::jsonb
)
where id = '...';
```

The legacy hardcoded `DEFAULT_FORCE_ESCALATE_PATTERNS` and
`DEFAULT_DOMAIN_THRESHOLDS` constants in `cascade_router.py` remain
exported for backward compat with existing tests and any direct
importers. The engine sits in front of them and is **always active in
production**: tenants without a `rules_profile` / `rules_inline`
setting load the built-in `default.yaml`, which re-encodes the same
patterns as the legacy constants. The only way to opt out of the
engine is to supply the legacy keys `force_escalate_patterns` /
`domain_thresholds` on the user row, which signals "I am managing the
legacy path; do not stack default rules on top of my overrides."

## Example use cases

These are the workloads we built the engine to serve. None of them are
benchmark-driven — they come from real customer conversations.

### Customer A — code blocks must always go to Opus

> "Our product reads pull request diffs and asks the LLM to suggest fixes.
> Cheap-tier responses on code are unreliable, but the verifier sometimes
> accepts them anyway. We want code prompts to skip the cascade entirely
> and go straight to Opus."

```yaml
- name: customer_a_code_to_opus
  priority: 100
  match:
    any_of:
      - regex: "```[a-z]*\\n"
      - regex: "^diff --git"
      - substring: "<<<<<<< HEAD"
  action:
    type: force_escalate
    to_tier: complex
  meta:
    rationale: "PR diff prompts: cheap tier <60% accept; override verifier."
```

### Customer B — PHI prompts force-escalate AND log compliance metadata

> "We process clinical notes. If a prompt mentions patient IDs or diagnosis
> codes we want it on Opus AND we need an audit trail showing which rule
> matched so we can produce evidence in a HIPAA review."

```yaml
- name: phi_keywords_force_opus
  priority: 200
  match:
    any_of:
      - substring: "patient_id"
      - substring: "mrn:"
      - regex: "\\bICD-?10[A-Z]?\\d+"
      - regex: "diagnosis\\s+code"
  action:
    type: force_escalate
    to_tier: complex
  meta:
    rationale: "PHI: highest-quality tier, audit trail captured."
    compliance_review: "HIPAA-2026-Q2"
    owner: "compliance@customerb.com"
```

The matched rule name (`phi_keywords_force_opus`) ships in
`cascade_meta.matched_rules` on every request. Compliance can grep the
`cascade_decisions` table by rule name to prove HIPAA-relevant prompts
never reached a cheap tier.

### Customer C — verbose prompts go to Opus directly

> "Our agentic workload sometimes sends 8K-token prompts when it stuffs the
> entire codebase context in. Those are always complex. We don't want to
> waste a Haiku call we know will fail."

```yaml
- name: long_prompts_force_opus
  priority: 80
  match:
    any_of:
      - prompt_length_min: 4000
  action:
    type: force_escalate
    to_tier: complex
  meta:
    rationale: "Agentic context-stuffed prompts: long → Opus directly."
```

## Audit trail

Every cascade decision logs the matched rule names into `cascade_meta`:

```json
{
  "matched_rules": ["phi_keywords_force_opus"],
  "rule_engine_profile": "customer_b_v2",
  "forced_escalation_pattern": "rule:phi_keywords_force_opus",
  "effective_threshold": 0.80,
  "escalated": true
}
```

The `rule_engine_profile` field tells you which profile produced the
decision (named profile or `"inline"`). For compliance / debugging, query
the `cascade_decisions` table by these fields.

## Hot reload

Profile YAML files are parsed once and cached per process. The cache
invalidates after 30 seconds or when the file's mtime changes — whichever
comes first. To deploy a new rule pack:

1. Edit the YAML file on disk (or upload via your config-management tool).
2. Wait up to 30s.
3. New rules take effect on the next request.

Inline rules apply on the next request after the user row is updated.

## Limits and safety

- Hard cap of 1000 rules per profile (defensive against degenerate
  configs).
- Regex compilation failures skip the rule and log a warning — they don't
  bring down the request path.
- Engine failures (yaml parse error, regex compile error, etc.) log a
  warning and fall through to the legacy hardcoded path. The cascade
  never errors a request because of a bad rule.
- Force-escalate rules can only ESCALATE. They cannot tell the cascade to
  use a cheaper model than the classifier predicted; use `force_cheap`
  for that, and read the comments — it's the dangerous knob.
