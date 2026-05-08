type Stat = {
  value: string;
  label: string;
  /** When true, the value is rendered in the brand accent color. Reserve for the
   * single most emotional stat on the band — for us that's the savings number. */
  accent?: boolean;
};

const STATS: Stat[] = [
  { value: "47%", label: "Lower Anthropic bill on our 50-prompt eval set, with no quality drop on Opus prompts.", accent: true },
  { value: "< 10 ms", label: "Classifier overhead per request. Faster than a DNS lookup." },
  { value: "96%", label: "Routing accuracy on our 50-prompt benchmark. We retrain it weekly." },
  { value: "2 lines", label: "Code change to start routing. Same SDK, new base URL." },
];

export const StatBand = () => {
  return (
    <section className="py-20 md:py-24 bg-[#fbfbfd] border-y border-black/[0.06]">
      <div className="max-w-[1160px] mx-auto px-6 sm:px-8">
        <p className="text-[12px] text-[#6e6e73] uppercase tracking-[0.12em] font-semibold text-center mb-10 md:mb-12">
          Numbers that matter, measured on real traffic
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-6">
          {STATS.map((s, i) => (
            <div
              key={s.label}
              className="text-center px-2 md:px-4 md:border-l md:first:border-l-0 border-black/[0.08]"
              style={{ borderLeftColor: i === 0 ? "transparent" : undefined }}
            >
              <div
                className="text-[36px] sm:text-[48px] md:text-[56px] font-semibold tracking-[-0.035em] leading-[1.05] mb-3"
                style={{ color: s.accent ? "#028a3e" : "#1d1d1f" }}
              >
                {s.value}
              </div>
              <div className="text-[13px] sm:text-[14px] md:text-[15px] text-[#424245] font-normal tracking-[-0.005em] max-w-[240px] mx-auto leading-[1.5]">
                {s.label}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
