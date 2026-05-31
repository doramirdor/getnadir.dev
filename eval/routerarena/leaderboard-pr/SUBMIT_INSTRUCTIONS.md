# RouterArena leaderboard README update — Nadir at #2

PR [RouteWorks/RouterArena#112](https://github.com/RouteWorks/RouterArena/pull/112)
(`nadir-cascade-v2`) was merged on 2026-05-31. The automated evaluation bot
returned the official scores below, but the leaderboard table in
`RouteWorks/RouterArena/README.md` has not yet been regenerated to include the
entry. This directory holds a ready-to-submit README edit that inserts Nadir at
its earned rank.

## Official evaluation result (from the PR's CI bot)

| Metric | Value |
|---|---|
| Acc-Cost Arena score | **0.7333** (→ 73.33) |
| Accuracy | 74.87% |
| Avg cost / 1K queries | $0.2932 (→ $0.29) |
| Robustness | 0.2548 (→ 25.48) |
| Queries | 8,400 (full split) |
| Gate checks | Passed all 4 |

Ranked by **Acc-Cost Arena** (the leaderboard's ranking column), 73.33 lands at
**#2**, behind Sqwish Router (75.27) and ahead of Weave Router (72.82).

> Note: the Robustness score (25.48) is low relative to the top entries
> (100.00). The leaderboard ranks by Acc-Cost Arena, so #2 stands, but expect a
> maintainer to ask about robustness. The PR notes a planned follow-up to
> rebuild the robustness predictions to mirror main routing.

## The change

Insert one row for `Nadir Cascade` as the new 🥈, demote Weave to 🥉 and
OrcaRouter to rank 4, and shift ranks 4–19 down to 5–20. See
`nadir_leaderboard.patch` (a unified diff against
`RouteWorks/RouterArena/main:README.md`) and `README.upstream.updated.md` (the
full updated upstream README for reference).

```
| 🥈 | [Nadir Cascade](https://getnadir.com) |  | 73.33 | 74.87 | $0.29 | — | — | — | — | 25.48 |
```

## How to open the upstream PR (from a RouterArena fork)

This repo's automation is scoped to `doramirdor/getnadir.dev` and cannot push
to `RouteWorks/RouterArena`, so the upstream PR has to be opened from a fork.

```bash
# 1. Fork RouteWorks/RouterArena on GitHub (once), then:
git clone https://github.com/<your-username>/RouterArena.git
cd RouterArena
git remote add upstream https://github.com/RouteWorks/RouterArena.git
git fetch upstream && git checkout -b leaderboard-add-nadir upstream/main

# 2. Apply the patch from this directory
git apply /path/to/getnadir.dev/eval/routerarena/leaderboard-pr/nadir_leaderboard.patch
#   (if the upstream README moved and the patch won't apply cleanly,
#    copy the single Nadir row above into the table manually and renumber)

# 3. Commit and push to your fork
git add README.md
git commit -m "Add Nadir Cascade to leaderboard (#2, Acc-Cost Arena 73.33)"
git push -u origin leaderboard-add-nadir

# 4. Open a PR from your fork's branch to RouteWorks/RouterArena:main
#    referencing the merged submission PR #112.
```
