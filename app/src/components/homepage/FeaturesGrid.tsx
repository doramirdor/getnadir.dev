const ITEMS = [
  {
    title: "Routing under ten milliseconds.",
    desc: "A lightweight classifier scores each prompt and picks the model. Faster than a DNS lookup.",
  },
  {
    title: "Your keys stay yours.",
    desc: "Bring your own provider keys. We proxy in memory and never log prompts unless you turn logging on.",
  },
  {
    title: "Every request, visible.",
    desc: "Per request cost, latency percentiles, token counts. Out of the box. No instrumentation.",
  },
  {
    title: "Failover without paging.",
    desc: "A provider goes down. Nadir retries against your chain. Your app stays up.",
  },
  {
    title: "Semantic cache, built in.",
    desc: "Identical and near identical prompts return from cache. Another slice of the bill gone.",
  },
  {
    title: "A/B test in production.",
    desc: "Route a slice of traffic to a new model. Compare cost, latency, quality. Roll out safely.",
  },
];

export const FeaturesGrid = () => {
  return (
    <section className="py-24 md:py-36 bg-[#fbfbfd] border-y border-black/[0.06]">
      <div className="max-w-[1160px] mx-auto px-6 sm:px-8">
        <div className="text-center max-w-[760px] mx-auto mb-16 md:mb-20">
          <h2 className="text-[40px] md:text-[56px] font-semibold tracking-[-0.034em] m-0 mb-5 text-[#1d1d1f] leading-[1.05]">
            Six things the other gateways don't ship.
          </h2>
          <p className="text-lg md:text-[21px] text-[#424245] m-0 leading-[1.4] tracking-[-0.01em]">
            Routing, caching, failover, and observability. One binary. One base URL.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-x-8 gap-y-12 md:gap-x-8 md:gap-y-14">
          {ITEMS.map((it) => (
            <div key={it.title}>
              <h3 className="text-[18px] md:text-[20px] font-semibold tracking-[-0.016em] m-0 mb-2.5 text-[#1d1d1f] leading-[1.25]">
                {it.title}
              </h3>
              <p className="text-[14px] md:text-[15px] text-[#424245] leading-[1.55] m-0 tracking-[-0.005em] max-w-[320px]">
                {it.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
