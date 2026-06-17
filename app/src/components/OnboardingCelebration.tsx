import { useEffect, useState } from "react";

// End-of-onboarding "Nice job!" takeover. Modeled on the editorial celebration
// pattern: a dark full-bleed moment, a display-serif headline, one punchy
// comparison stat, and a single Continue button. Where a dictation app would
// show "3x faster than typing", Nadir shows the cost story from the user's very
// first routed call: what always-Opus would have cost vs what Nadir charged.

interface FirstCallResult {
  ok: boolean;
  model?: string;
  costUsd?: number | null;
  benchmarkModel?: string | null;
  savingsPct?: number | null;
}

interface Props {
  result: FirstCallResult | null;
  freeLimit: number;
  onContinue: () => void;
}

// "claude-opus-4-6" -> "Opus 4.6"
const prettyModel = (m?: string | null): string => {
  if (!m) return "always-on Opus";
  const parts = m.replace(/^claude-/, "").split("-");
  if (parts.length === 0) return m;
  const name = parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
  const ver = parts.slice(1).join(".");
  return ver ? `${name} ${ver}` : name;
};

const fmtCost = (n: number): string => {
  if (n === 0) return "$0";
  if (n < 0.0001) return `$${n.toExponential(1)}`;
  if (n < 0.01) return `$${n.toFixed(4)}`;
  if (n < 1) return `$${n.toFixed(3)}`;
  return `$${n.toFixed(2)}`;
};

export const OnboardingCelebration = ({ result, freeLimit, onContinue }: Props) => {
  // Drive bar widths from a sliver on mount so they grow into place. A short
  // timeout (rather than rAF, which headless/background tabs throttle) reliably
  // flips us to the final widths even if the frame callback never fires.
  const [grown, setGrown] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setGrown(true), 60);
    return () => clearTimeout(id);
  }, []);

  const savings = result?.ok ? result.savingsPct ?? null : null;
  const hasSavings = savings != null && savings > 0 && savings < 100;

  // Derived comparison numbers (only meaningful when we have a real first call).
  const routed = result?.costUsd ?? null;
  const benchmarkCost =
    hasSavings && routed != null ? routed / (1 - savings / 100) : null;
  const multiplier = hasSavings ? 100 / (100 - savings) : null;
  const benchModelLabel = prettyModel(result?.benchmarkModel);

  // "5x" / "2.5x" — integer when it lands clean, else one decimal.
  const multiplierLabel =
    multiplier != null
      ? multiplier.toFixed(multiplier >= 10 ? 0 : 1).replace(/\.0$/, "")
      : null;
  const showMultiplier = multiplier != null && multiplier >= 2;

  // Nadir's bar is the short, vivid one (small cost = good); the benchmark bar
  // is the long, muted one. The contrast is the whole point.
  const nadirBarPct = hasSavings ? Math.max(6, 100 - savings) : 100;

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-[#191919] text-[#f5f5f3]">
      {/* faint brand glow so the flat charcoal has some depth */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-1/3 right-[-10%] h-[70vh] w-[70vh] rounded-full opacity-[0.07] blur-3xl"
        style={{ background: "radial-gradient(circle, hsl(152 55% 46%) 0%, transparent 70%)" }}
      />

      <div className="relative mx-auto flex min-h-screen max-w-5xl flex-col px-6 py-10 md:px-12 md:py-14">
        {/* Brand wordmark */}
        <div className="mb-10 flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#34d399]">
            <span className="text-[13px] font-bold text-[#0c2a1d]">N</span>
          </div>
          <span className="text-sm font-semibold tracking-tight text-white/90">Nadir</span>
        </div>

        {/* Headline */}
        <h1
          className="font-display text-[64px] leading-[0.95] text-white md:text-[104px] stat-reveal"
          style={{ ["--stat-delay" as string]: "60ms" }}
        >
          Nice job!
        </h1>

        <div className="mt-10 grid flex-1 items-center gap-y-12 md:mt-14 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,0.9fr)] lg:gap-x-8">
          {/* ── Left: the comparison ───────────────────────────────────── */}
          <div className="w-full max-w-md">
            <p
              className="text-2xl font-semibold tracking-tight text-white md:text-[28px] stat-reveal"
              style={{ ["--stat-delay" as string]: "180ms" }}
            >
              {hasSavings ? "Your first call" : "You're all set"}
            </p>

            {hasSavings ? (
              <div className="mt-7 space-y-6">
                {/* Benchmark (always-Opus) — long, muted bar */}
                <div
                  className="stat-reveal"
                  style={{ ["--stat-delay" as string]: "320ms" }}
                >
                  <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/45">
                    Always {benchModelLabel}
                  </div>
                  <div className="flex h-11 items-center rounded-lg bg-[#e8e4d8] px-4 transition-[width] duration-700 ease-out"
                    style={{ width: grown ? "100%" : "12%" }}
                  >
                    <span className="mono text-[15px] font-semibold text-[#1a1a1a]">
                      {benchmarkCost != null ? fmtCost(benchmarkCost) : ""}
                    </span>
                  </div>
                </div>

                {/* Nadir — short, vivid bar. The bar stays a truthful sliver
                    (so it visually matches the "Nx cheaper" headline); the cost
                    label rides just outside it so it's always legible. */}
                <div
                  className="stat-reveal"
                  style={{ ["--stat-delay" as string]: "460ms" }}
                >
                  <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#6ee7b7]">
                    With Nadir{result?.model ? ` · ${prettyModel(result.model)}` : ""}
                  </div>
                  <div className="flex items-center gap-3">
                    <div
                      className="h-11 shrink-0 rounded-lg bg-[#34d399] transition-[width] duration-700 ease-out"
                      style={{ width: grown ? `${nadirBarPct}%` : "6%", transitionDelay: "120ms" }}
                    />
                    <span className="mono whitespace-nowrap text-[15px] font-semibold text-[#34d399]">
                      {routed != null ? fmtCost(routed) : ""}
                    </span>
                  </div>
                </div>

                <p
                  className="text-[13px] text-white/45 stat-reveal"
                  style={{ ["--stat-delay" as string]: "600ms" }}
                >
                  Routed to {prettyModel(result?.model)} on this request.
                </p>
              </div>
            ) : (
              <ul className="mt-7 space-y-3">
                {[
                  { label: "Smart routing", status: "On" },
                  { label: "Auto-fallback", status: "On" },
                  { label: `${freeLimit} free requests`, status: "Ready" },
                ].map((item, i) => (
                  <li
                    key={item.label}
                    className="flex items-center justify-between gap-3 rounded-lg bg-white/[0.06] px-4 py-3 text-[15px] font-medium text-white/90 stat-reveal"
                    style={{ ["--stat-delay" as string]: `${280 + i * 120}ms` }}
                  >
                    <span className="flex items-center gap-3">
                      <span className="text-[#34d399]">✓</span>
                      {item.label}
                    </span>
                    <span className="text-[13px] font-semibold text-[#34d399]">{item.status}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* ── Middle: hand-drawn arrow (desktop only) ─────────────────── */}
          <div
            className="hidden self-center lg:block stat-reveal"
            style={{ ["--stat-delay" as string]: "560ms" }}
            aria-hidden
          >
            <svg width="150" height="150" viewBox="0 0 150 150" fill="none">
              <path
                d="M8 40 C 70 20, 120 40, 118 95"
                stroke="#6ee7b7"
                strokeWidth="2.5"
                strokeLinecap="round"
                fill="none"
              />
              {/* little loop for character */}
              <path
                d="M118 95 C 100 92, 96 112, 116 112 C 132 112, 130 90, 118 95"
                stroke="#6ee7b7"
                strokeWidth="2.5"
                strokeLinecap="round"
                fill="none"
              />
              <path
                d="M116 112 C 122 122, 130 130, 140 134"
                stroke="#6ee7b7"
                strokeWidth="2.5"
                strokeLinecap="round"
                fill="none"
              />
              <path
                d="M140 134 L 128 134 M140 134 L 137 122"
                stroke="#6ee7b7"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
            </svg>
          </div>

          {/* ── Right: the hero stat + CTA ──────────────────────────────── */}
          <div className="w-full">
            {hasSavings ? (
              <>
                <div
                  className="font-display leading-[0.9] stat-reveal"
                  style={{ ["--stat-delay" as string]: "700ms" }}
                >
                  <span className="text-[88px] text-white md:text-[120px]">
                    {showMultiplier ? `${multiplierLabel}x ` : `${Math.round(savings)}% `}
                  </span>
                  <span className="text-[88px] italic text-[#34d399] md:text-[120px]">
                    cheaper!
                  </span>
                </div>
                <p
                  className="mt-2 text-lg font-semibold text-white/90 md:text-xl stat-reveal"
                  style={{ ["--stat-delay" as string]: "820ms" }}
                >
                  than always running {benchModelLabel}
                </p>
              </>
            ) : (
              <>
                <div
                  className="font-display leading-[0.9] stat-reveal"
                  style={{ ["--stat-delay" as string]: "560ms" }}
                >
                  <span className="text-[64px] text-white md:text-[88px]">Routing's </span>
                  <span className="text-[64px] italic text-[#34d399] md:text-[88px]">ready.</span>
                </div>
                <p
                  className="mt-3 max-w-sm text-base text-white/70 stat-reveal"
                  style={{ ["--stat-delay" as string]: "680ms" }}
                >
                  Send a real request and watch Nadir route it to the cheapest model that fits.
                  Typically 30 to 60% under always-Opus.
                </p>
              </>
            )}

            <button
              type="button"
              onClick={onContinue}
              className="mt-9 w-full max-w-sm rounded-full bg-[#e8e4d8] px-6 py-4 text-[15px] font-semibold text-[#1a1a1a] transition-colors hover:bg-white active:scale-[0.99] stat-reveal"
              style={{ ["--stat-delay" as string]: hasSavings ? "940ms" : "800ms" }}
            >
              Continue to dashboard
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OnboardingCelebration;
