I just benchmarked my LLM router against sending everything to Claude Opus 4.6.

Real prompts. No cherry-picking. No synthetic datasets. Just actual prompts people use every day.

The results?

Up to 30% cost savings depending on prompt complexity.
Quality maintained, verified by an independent LLM judge.
Zero code changes needed.

The thing that surprised me most: medium-complexity prompts are the sweet spot. That's where the biggest savings showed up. Simple prompts saved a decent chunk too. And complex prompts? The router was smart enough to leave them alone. It correctly sent them to the best model.

That's the whole point. You don't want a router that cuts corners on hard tasks. You want one that knows when it's safe to route down.

I ran 6 different configurations. Baseline (pure Opus). Router only. Router + safe optimization. Router + aggressive mode. All documented, all reproducible.

At scale, this adds up to thousands saved per year. And that's with conservative estimates.

NadirClaw is open source. MIT licensed. Self-hosted. No vendor lock-in.

If you're spending real money on LLM APIs, this is worth 5 minutes of your time. Link in the comments.

---
FIRST COMMENT (post immediately after publishing):
Full benchmark writeup with methodology, tables, and every prompt I tested: https://getnadir.com/blog/6-way-routing-benchmark-results.html
