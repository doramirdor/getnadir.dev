# Product Hunt Listing Copy

## Tagline (under 60 chars)
AI router that cuts your LLM costs 60% — no code changes

## Description

Nadir reads every LLM prompt and routes it to the cheapest model that can handle it. Simple tasks go to Haiku ($1/M tokens), code tasks to Sonnet ($3/M), and only genuinely hard reasoning goes to Opus ($5/M). A verifier catches misroutes before they reach the user.

**The results:** 60% lower bill, 98% of always-Opus quality, verified on 11,420 held-out RouterBench triples. #3 on the RouterArena public leaderboard.

**How to start:**
1. Swap your base URL to `api.getnadir.com/v1`
2. Set `model="auto"`
3. That's it. Same SDK, same code, lower bill.

**Pricing:** No monthly fee. We charge 25% of what we save you on the first $2K, 10% above. If we save you nothing, you pay nothing. The open-source core (NadirClaw) is free to self-host.

**For Product Hunt:** 50 free API calls on signup, no credit card required.

## First Comment (Maker's Comment)

Hey PH! I'm [name], the maker of Nadir.

I built Nadir because I was tired of paying Opus rates for tasks that Haiku handles perfectly. If you've ever watched your LLM bill climb while knowing half your prompts are simple classifications or reformats, you know the feeling.

The idea is simple: a verifier-gated router that reads every prompt and sends it to the cheapest model that won't mess it up. The verifier is the key — it catches misroutes *before* the response reaches the user, so you get cheap prices without quality surprises.

Here's where we are today:
- **60% cost savings** on RouterBench (11,420 held-out prompts, 0 training contamination)
- **98% quality preserved** vs. always-Opus
- **#3 on RouterArena** (0.733 arena_score, n=8,400)
- **92.1% routing accuracy** vs Not Diamond's 27.0% on the same benchmark
- **180ms verifier latency** on CPU (INT8 quantized)

Two lines to integrate — just swap the base URL and set `model="auto"`. Works with every OpenAI-compatible SDK.

For PH supporters: 50 free API calls, no credit card required. Would love your feedback on the routing quality!

## Gallery Images (suggested)

1. **Hero image** — "Cut your LLM bill 60%. Zero quality loss." with the live routing terminal
2. **How it works** — The three-step flow (swap URL → Nadir routes → keep savings)
3. **Benchmark results** — RouterBench comparison table + RouterArena score card
4. **Dashboard screenshot** — Analytics showing per-request routing decisions and savings
5. **Code snippet** — The 2-line integration (before/after)

## Topics
- Artificial Intelligence
- Developer Tools
- Open Source
- SaaS
- API

## Links
- Website: https://getnadir.com/producthunt
- GitHub: https://github.com/NadirRouter/NadirClaw
- Docs: https://getnadir.com/docs
- Pricing: https://getnadir.com/pricing
