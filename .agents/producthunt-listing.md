# Product Hunt Listing

## Tagline (under 60 chars)
AI router that cuts your LLM costs 60% — no code changes

## Description

Most LLM calls don't need your most expensive model. A "summarize this email" shouldn't cost the same as "architect a distributed system" — but if you're sending everything to Opus or GPT-4, it does.

Nadir fixes this. Drop in our API (two lines — just swap the base URL and set `model="auto"`) and every prompt gets routed to the cheapest model that can handle it well. Haiku for the easy stuff, Sonnet for code, Opus only when it actually needs to think.

**How we're different from other routers:**
- A verifier catches misroutes *before* the response reaches the user — so you get cheap prices without quality surprises
- #4 on RouterArena (72.3 arena_score) and 92.1% accuracy on a held-out RouterBench subset
- Fully OpenAI-compatible — works with any SDK, any framework, any language
- Open-source core (NadirClaw, MIT) if you want to self-host

**Pricing:** No monthly fee. We take 25% of what we save you on the first $2K, 10% above that. If we save you nothing, you pay nothing.

50 free API calls to try it, no credit card required. Product Hunt supporters who bring their own keys get $5 off their first month of Pro with code `PRODUCTHUNT` (applies to our fee, not your API usage).

## First Comment (Maker's Comment)

Hey PH! I'm Dor, the maker of Nadir.

I built this because I was spending $800/mo on Claude Opus for an app where half the prompts were simple classifications and reformats. Switching those to Haiku manually meant maintaining routing logic that broke every time I changed a prompt. So I trained a classifier to do it automatically.

The key insight was adding a verifier — a second, lightweight check that catches when the classifier routes a hard prompt to a cheap model. That's what lets us promise 98% quality: the verifier is the safety net.

Where we are today:
- 60% average cost savings on real workloads
- #4 on RouterArena, 92.1% on RouterBench (vs 27% for Not Diamond's open-source router on the same 3,313-prompt held-out subset)
- 180ms routing overhead on CPU
- Two lines to integrate — works with every OpenAI-compatible SDK

Would love your feedback, especially on routing quality. Try it on your weirdest prompts — that's where routers usually break, and where we've spent the most time.

## Gallery Images (suggested)

1. Hero — "Cut your LLM bill 60%. Zero quality loss." with code snippet
2. How it works — 3-step flow (swap URL → Nadir routes → keep savings)
3. Benchmark results — RouterArena + RouterBench comparison
4. Dashboard screenshot — per-request routing decisions and savings
5. Code snippet — before/after integration (2 lines changed)

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
