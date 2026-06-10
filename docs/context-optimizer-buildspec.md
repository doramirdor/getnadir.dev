# Context-waste optimization: clean-room build spec for Nadir

Source: concept extraction from the documented behavior (README/docs/SKILL.md only,
no source files opened) of alexgreensh/token-optimizer (PolyForm Noncommercial).
This spec is the implementation reference; implementers must NOT open that repo's
source tree. Date: 2026-06-10.

## Why this matters for Nadir

token-optimizer is an agent-harness companion; Nadir is a routing proxy that sees
the full message array of every request. The transferable economics: 80%+ of token
volume is the same prefix re-billed every turn ("ghost tokens"), cache-safety is a
hard invariant (never rewrite content already in context, only the suffix and the
compaction boundary), and context quality decay is measurable and worth scoring.

## NadirClaw (MIT, open source) - context-optimization extensions

1. Ghost-token report (~2-3 days): per-session prefix-overhead metric
   (prefix tokens x turns) in `nadirclaw stats` and the optimize dry-run.
2. Suffix-only dedup (~1 week): replace trailing message blocks byte-identical to
   earlier ones with a reference marker. Cache-safe by construction.
3. Conversation quality score + S-F grade bands (~1 week): 0-100 from fill % vs
   model window, duplicate-content ratio, loop similarity, payload growth. Exposed
   in `nadir_metadata` + CLI dashboard. Differentiator: nobody scores context
   health at the API boundary.
4. Decision-preserving history trim (~3-4 days): when MAX_TURNS trims, keep a
   compact decisions digest (pattern-matched "chose X because Y" statements).
5. Loop detection (~2 days): similarity over last N user messages, warn in metadata.

Skip (harness-level, not router-level): bash output compression, file-read hooks,
statusline, memory audits.

## getnadir.dev (hosted) - pruning + savings dashboard

1. Three-tier savings methodology (~1 week, HIGHEST ROI): restructure the Savings
   page into Measured / Estimated / Opportunity, never summed. Measured =
   savings_tracking routing deltas + kompress compression events. Opportunity =
   would-have-compressed requests + remaining benchmark-share routable down.
   Sample sizes shown. The honesty framing is itself the selling point.
2. Frozen-baseline counterfactual headline (~1 week): winsorized mean per-request
   cost over the account's first 30 days, frozen; vs trailing 30 days scaled by
   volume; waterfall split routing/compression/caching/output. Hide until sample
   gates pass. Data already in usage_logs + savings_tracking.
3. Ghost-token / prefix-waste card (~1 week): rolling-hash detection of identical
   prefixes resent per API key (works with store_prompts=false; hashes suffice).
   "X% of your input is a repeated prefix; enable kompress/caching to reclaim
   ~$Y/mo." Opportunity tier.
4. Per-conversation quality grades in Logs (~1.5-2 weeks): same scoring spec as
   NadirClaw item 3 (open core), grade chips + trends hosted-only.
5. Behavioral waste detectors (~3-5 days): retry churn, loop sessions, oversized
   prompts, model-mix drift, "overpowered model" findings with dollar figures.

Skip hosted: compaction checkpoint/restore (stateless proxy; possible later as an
SDK feature), filesystem audits.

Suggested order: hosted 1 -> 2 (pure analytics, no request-path risk), then
NadirClaw 1+3 (cheap OSS differentiation), then dedup/decision-trim, detectors.

## License discipline (PolyForm Noncommercial 1.0.0)

MAY: implement the ideas above independently (proxy-layer architecture forces
divergence anyway); coin our own names ("prefix waste", "context overhead", NOT
their product names); cite public facts (provider cache multipliers, MRCR decay)
from primary sources.

MUST NOT: use any of their source code (even paraphrased/ported), assets,
dashboard HTML/CSS, doc prose, message templates, or their exact constant bundles
(checkpoint thresholds, similarity cutoffs, cooldowns) as a set; derive our own
thresholds from Nadir eval data.

Note: Nadir's kompress (PR #13) builds on headroom-ai (Apache-2.0), a separate
project with no license interaction.
