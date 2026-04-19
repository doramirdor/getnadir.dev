const STATS = [
  { value: "< 10 ms", label: "Classifier overhead per request. Faster than a DNS lookup." },
  { value: "400+ models", label: "OpenAI, Anthropic, Google, xAI, Groq. One API." },
  { value: "96%", label: "Routing accuracy on our 50-prompt benchmark." },
  { value: "2 lines", label: "Code change to start routing. No new SDK." },
];

export const StatBand = () => {
  return (
    <section className="py-20 md:py-24 bg-[#fbfbfd] border-y border-black/[0.06]">
      <div className="max-w-[1160px] mx-auto px-6 sm:px-8 grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-6">
        {STATS.map((s, i) => (
          <div
            key={s.label}
            className="text-center px-2 md:px-4 md:border-l md:first:border-l-0 border-black/[0.08]"
            style={{ borderLeftColor: i === 0 ? "transparent" : undefined }}
          >
            <div className="text-[32px] sm:text-[44px] md:text-[52px] font-semibold tracking-[-0.035em] leading-[1.05] mb-3 text-[#1d1d1f]">
              {s.value}
            </div>
            <div className="text-[13px] sm:text-[15px] text-[#424245] font-normal tracking-[-0.01em] max-w-[240px] mx-auto leading-[1.45]">
              {s.label}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};
