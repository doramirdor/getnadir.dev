type Bucket = "speed" | "reliability" | "visibility";

const BUCKET_LABEL: Record<Bucket, string> = {
  speed: "Speed",
  reliability: "Reliability",
  visibility: "Visibility",
};

const BUCKET_COLOR: Record<Bucket, string> = {
  speed: "#028a3e",
  reliability: "#0071e3",
  visibility: "#1d1d1f",
};

type Item = {
  bucket: Bucket;
  title: string;
  desc: string;
  icon: React.ReactNode;
};

const ITEMS: Item[] = [
  {
    bucket: "speed",
    title: "Routing in under 10 ms.",
    desc: "A trained classifier scores each prompt and picks the cheapest model that can answer it. Faster than your DNS lookup.",
    icon: <BoltIcon />,
  },
  {
    bucket: "speed",
    title: "Semantic cache, on by default.",
    desc: "Identical and near-identical prompts return from cache. The cheapest token is the one you never send.",
    icon: <CacheIcon />,
  },
  {
    bucket: "reliability",
    title: "Failover without paging.",
    desc: "A provider goes down. Nadir retries against your chain. Your app stays up. Your on-call sleeps.",
    icon: <ShieldIcon />,
  },
  {
    bucket: "reliability",
    title: "Your keys stay yours.",
    desc: "Bring your own provider keys. We proxy in memory and never log prompts unless you turn logging on.",
    icon: <LockIcon />,
  },
  {
    bucket: "visibility",
    title: "Every request, visible.",
    desc: "Per-request cost, latency percentiles, token counts, routing decisions. Out of the box. No instrumentation.",
    icon: <EyeIcon />,
  },
  {
    bucket: "visibility",
    title: "A/B test in production.",
    desc: "Route a slice of traffic to a new model. Compare cost, latency, quality side by side. Roll out when you're convinced.",
    icon: <BeakerIcon />,
  },
];

export const FeaturesGrid = () => {
  return (
    <section className="py-24 md:py-36 bg-[#fbfbfd] border-y border-black/[0.06]">
      <div className="max-w-[1160px] mx-auto px-6 sm:px-8">
        <div className="text-center max-w-[760px] mx-auto mb-16 md:mb-20">
          <p className="text-[12px] text-[#028a3e] uppercase tracking-[0.12em] font-semibold mb-4">
            What's actually in the box
          </p>
          <h2 className="text-[40px] md:text-[56px] font-semibold tracking-[-0.034em] m-0 mb-5 text-[#1d1d1f] leading-[1.05]">
            Six things the other gateways don't ship.
          </h2>
          <p className="text-lg md:text-[21px] text-[#424245] m-0 leading-[1.4] tracking-[-0.01em]">
            Routing, caching, failover, observability. One binary. One base URL.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 md:gap-6">
          {ITEMS.map((it) => (
            <div
              key={it.title}
              className="bg-white border border-black/[0.06] rounded-[16px] p-7 md:p-8 hover:border-black/[0.14] hover:-translate-y-px transition-all duration-200"
            >
              <div
                className="inline-flex items-center justify-center w-10 h-10 rounded-[10px] mb-5"
                style={{
                  background: it.bucket === "speed"
                    ? "rgba(48,209,88,0.10)"
                    : it.bucket === "reliability"
                    ? "rgba(0,113,227,0.08)"
                    : "rgba(29,29,31,0.06)",
                  color: BUCKET_COLOR[it.bucket],
                }}
              >
                {it.icon}
              </div>
              <p
                className="text-[11px] font-semibold uppercase tracking-[0.1em] mb-2"
                style={{ color: BUCKET_COLOR[it.bucket] }}
              >
                {BUCKET_LABEL[it.bucket]}
              </p>
              <h3 className="text-[18px] md:text-[20px] font-semibold tracking-[-0.016em] m-0 mb-2.5 text-[#1d1d1f] leading-[1.25]">
                {it.title}
              </h3>
              <p className="text-[14px] md:text-[15px] text-[#424245] leading-[1.55] m-0 tracking-[-0.005em]">
                {it.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

function BoltIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M13 2L3 14h7l-1 8 10-12h-7l1-8z" />
    </svg>
  );
}
function CacheIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M3 5v6c0 1.7 4 3 9 3s9-1.3 9-3V5" />
      <path d="M3 11v6c0 1.7 4 3 9 3s9-1.3 9-3v-6" />
    </svg>
  );
}
function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 2l8 4v6c0 5-3.5 9-8 10-4.5-1-8-5-8-10V6l8-4z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}
function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 018 0v3" />
    </svg>
  );
}
function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
function BeakerIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M9 3h6" />
      <path d="M10 3v6L4 20a2 2 0 002 2h12a2 2 0 002-2L14 9V3" />
      <path d="M6.5 15h11" />
    </svg>
  );
}
