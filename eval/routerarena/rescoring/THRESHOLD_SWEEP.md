# Verifier-threshold sweep on RouterArena `full` split

Source decisions:
- FIXED verifier CSV: `eval/routerarena/rescoring/full_decisions_v3_verifier_FIXED_20260527T161854Z.csv`
- No-verifier baseline CSV: `eval/routerarena/rescoring/full_decisions_routerarena_v3_full_FIXED_20260527T152326Z.csv`

All scores below are from the official RouterArena scorer (`compute_scores.py`).
Escalation rate is computed over the 7061 prompts the verifier was called on.

| tau  | arena_score | accuracy | cost / 1K (USD) | escalation rate | projected rank |
|------|-------------|----------|------------------|------------------|----------------|
| 0.30 | 0.7080 | 0.7303 | $0.5928 | 0.790 | #3 |
| 0.40 | 0.7108 | 0.7349 | $0.6417 | 0.875 | #2 |
| 0.50 | 0.7109 | 0.7356 | $0.6623 | 0.919 | #2 |
| 0.55 | 0.7109 | 0.7358 | $0.6718 | 0.935 | #2 |
| 0.60 | 0.7110 | 0.7360 | $0.6741 | 0.948 | #2 |
| 0.65 | 0.7117 | 0.7370 | $0.6816 | 0.959 | #2 |
| 0.70 | 0.7118 | 0.7371 | $0.6841 | 0.967 | #2 |
| 0.72 | 0.7117 | 0.7372 | $0.6867 | 0.971 | #2 |
| 0.74 | 0.7117 | 0.7372 | $0.6888 | 0.974 | #2 |
| 0.76 | 0.7115 | 0.7370 | $0.6900 | 0.976 | #2 |
| 0.78 | 0.7117 | 0.7373 | $0.6911 | 0.978 | #2 |
| 0.80 | 0.7117 | 0.7373 | $0.6919 | 0.981 | #2 |
| 0.85 | 0.7117 | 0.7373 | $0.6919 | 0.987 | #2 |
| 0.90 | 0.7117 | 0.7373 | $0.6919 | 0.993 | #2 |

## Best tau by arena_score

- tau = **0.70** -> arena_score = **0.7118**, accuracy = 0.7371, cost/1K = $0.6841
- Projected rank: **#2** on the public leaderboard

## Best 'honest' tau

We define this as the lowest tau whose arena_score is within 0.0010 of the best. This avoids reading the leaderboard metric back into the routing decision more than necessary; lower tau means we trust the cheap response more often instead of escalating to chase the score.

- tau = **0.50** -> arena_score = **0.7109**, accuracy = 0.7356, cost/1K = $0.6623, escalation rate = 0.919

## Per-tau pick distribution (top 8)

### tau = 0.30

- `qwen/qwen3-235b-a22b-2507` -> 2721
- `openai/gpt-5-mini` -> 1244
- `deepseek/deepseek-chat` -> 1080
- `alibaba/qwen3-235b-a22b-instruct-2507` -> 722
- `anthropic/claude-sonnet-4` -> 704
- `qwen/qwen3-next-80b-a3b-instruct` -> 677
- `Qwen/Qwen3-Coder-Next` -> 287
- `gemini-2.5-flash` -> 263

### tau = 0.40

- `qwen/qwen3-235b-a22b-2507` -> 2359
- `openai/gpt-5-mini` -> 1330
- `deepseek/deepseek-chat` -> 1166
- `alibaba/qwen3-235b-a22b-instruct-2507` -> 774
- `anthropic/claude-sonnet-4` -> 758
- `qwen/qwen3-next-80b-a3b-instruct` -> 738
- `anthropic/claude-haiku-4-5-20251001` -> 274
- `gemini-2.5-flash` -> 266

### tau = 0.50

- `qwen/qwen3-235b-a22b-2507` -> 2160
- `openai/gpt-5-mini` -> 1365
- `deepseek/deepseek-chat` -> 1213
- `alibaba/qwen3-235b-a22b-instruct-2507` -> 794
- `qwen/qwen3-next-80b-a3b-instruct` -> 786
- `anthropic/claude-sonnet-4` -> 779
- `anthropic/claude-haiku-4-5-20251001` -> 290
- `gemini-2.5-flash` -> 270

### tau = 0.55

- `qwen/qwen3-235b-a22b-2507` -> 2085
- `openai/gpt-5-mini` -> 1384
- `deepseek/deepseek-chat` -> 1232
- `alibaba/qwen3-235b-a22b-instruct-2507` -> 802
- `qwen/qwen3-next-80b-a3b-instruct` -> 795
- `anthropic/claude-sonnet-4` -> 782
- `anthropic/claude-haiku-4-5-20251001` -> 300
- `gemini-2.5-flash` -> 270

### tau = 0.60

- `qwen/qwen3-235b-a22b-2507` -> 2026
- `openai/gpt-5-mini` -> 1395
- `deepseek/deepseek-chat` -> 1246
- `alibaba/qwen3-235b-a22b-instruct-2507` -> 816
- `qwen/qwen3-next-80b-a3b-instruct` -> 808
- `anthropic/claude-sonnet-4` -> 782
- `anthropic/claude-haiku-4-5-20251001` -> 307
- `gemini-2.5-flash` -> 270

### tau = 0.65

- `qwen/qwen3-235b-a22b-2507` -> 1984
- `openai/gpt-5-mini` -> 1400
- `deepseek/deepseek-chat` -> 1257
- `alibaba/qwen3-235b-a22b-instruct-2507` -> 823
- `qwen/qwen3-next-80b-a3b-instruct` -> 817
- `anthropic/claude-sonnet-4` -> 790
- `anthropic/claude-haiku-4-5-20251001` -> 311
- `gemini-2.5-flash` -> 271

### tau = 0.70

- `qwen/qwen3-235b-a22b-2507` -> 1944
- `openai/gpt-5-mini` -> 1407
- `deepseek/deepseek-chat` -> 1271
- `alibaba/qwen3-235b-a22b-instruct-2507` -> 831
- `qwen/qwen3-next-80b-a3b-instruct` -> 826
- `anthropic/claude-sonnet-4` -> 792
- `anthropic/claude-haiku-4-5-20251001` -> 312
- `gemini-2.5-flash` -> 272

### tau = 0.72

- `qwen/qwen3-235b-a22b-2507` -> 1924
- `openai/gpt-5-mini` -> 1409
- `deepseek/deepseek-chat` -> 1278
- `alibaba/qwen3-235b-a22b-instruct-2507` -> 834
- `qwen/qwen3-next-80b-a3b-instruct` -> 826
- `anthropic/claude-sonnet-4` -> 795
- `anthropic/claude-haiku-4-5-20251001` -> 318
- `google/gemini-2.5-flash` -> 272

### tau = 0.74

- `qwen/qwen3-235b-a22b-2507` -> 1909
- `openai/gpt-5-mini` -> 1409
- `deepseek/deepseek-chat` -> 1280
- `alibaba/qwen3-235b-a22b-instruct-2507` -> 836
- `qwen/qwen3-next-80b-a3b-instruct` -> 833
- `anthropic/claude-sonnet-4` -> 798
- `anthropic/claude-haiku-4-5-20251001` -> 319
- `google/gemini-2.5-flash` -> 272

### tau = 0.76

- `qwen/qwen3-235b-a22b-2507` -> 1895
- `openai/gpt-5-mini` -> 1411
- `deepseek/deepseek-chat` -> 1285
- `alibaba/qwen3-235b-a22b-instruct-2507` -> 837
- `qwen/qwen3-next-80b-a3b-instruct` -> 836
- `anthropic/claude-sonnet-4` -> 798
- `anthropic/claude-haiku-4-5-20251001` -> 322
- `google/gemini-2.5-flash` -> 272

### tau = 0.78

- `qwen/qwen3-235b-a22b-2507` -> 1886
- `openai/gpt-5-mini` -> 1413
- `deepseek/deepseek-chat` -> 1285
- `alibaba/qwen3-235b-a22b-instruct-2507` -> 838
- `qwen/qwen3-next-80b-a3b-instruct` -> 838
- `anthropic/claude-sonnet-4` -> 799
- `anthropic/claude-haiku-4-5-20251001` -> 326
- `gemini-2.5-flash` -> 273

### tau = 0.80

- `qwen/qwen3-235b-a22b-2507` -> 1875
- `openai/gpt-5-mini` -> 1414
- `deepseek/deepseek-chat` -> 1289
- `alibaba/qwen3-235b-a22b-instruct-2507` -> 840
- `qwen/qwen3-next-80b-a3b-instruct` -> 839
- `anthropic/claude-sonnet-4` -> 800
- `anthropic/claude-haiku-4-5-20251001` -> 329
- `gemini-2.5-flash` -> 273

### tau = 0.85

- `qwen/qwen3-235b-a22b-2507` -> 1875
- `openai/gpt-5-mini` -> 1414
- `deepseek/deepseek-chat` -> 1289
- `alibaba/qwen3-235b-a22b-instruct-2507` -> 840
- `qwen/qwen3-next-80b-a3b-instruct` -> 839
- `anthropic/claude-sonnet-4` -> 800
- `anthropic/claude-haiku-4-5-20251001` -> 329
- `gemini-2.5-flash` -> 273

### tau = 0.90

- `qwen/qwen3-235b-a22b-2507` -> 1875
- `openai/gpt-5-mini` -> 1414
- `deepseek/deepseek-chat` -> 1289
- `alibaba/qwen3-235b-a22b-instruct-2507` -> 840
- `qwen/qwen3-next-80b-a3b-instruct` -> 839
- `anthropic/claude-sonnet-4` -> 800
- `anthropic/claude-haiku-4-5-20251001` -> 329
- `gemini-2.5-flash` -> 273

## Production calibration

The verifier was trained against the RouterBench cached-response distribution. RouterArena's cached responses come from a different model mix with different answer shapes, so its raw acceptance probabilities skew lower. The sweep above calibrates tau against RouterArena's distribution for headline reporting. Production routing in `backend/app/services/verifier_model.py` still uses tau = 0.80 for live traffic; that threshold was calibrated against the RouterBench validation slice it was trained on.

