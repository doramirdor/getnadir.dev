import { useEffect, useRef, useState } from "react";
import { Loader2, ArrowRight } from "lucide-react";
import { Sparkle } from "@/components/brand/motifs";

// End-of-onboarding "Nice job!" takeover. A deep-ink full-bleed editorial
// moment in the blueprint brand palette: a Playfair headline, one punchy
// comparison stat, and a Continue button. Where a dictation app would show
// "3x faster than typing", Nadir shows the cost story from the user's very
// first routed call: what always-Opus would have cost vs what Nadir charged.
//
// If the user finished onboarding WITHOUT adding credit, this screen also
// re-offers the $5 (→$7) top-up — a last, well-timed nudge (skip-recovery).

interface FirstCallResult {
  ok: boolean;
  model?: string;
  costUsd?: number | null;
  benchmarkModel?: string | null;
  benchmarkCostUsd?: number | null;
  savingsPct?: number | null;
}

interface Props {
  result: FirstCallResult | null;
  freeLimit: number;
  onContinue: () => void;
  billingActive?: boolean;
  subscribing?: boolean;
  onAddCredit?: () => void;
}

// Brand palette (blueprint) as literal hexes so the dark takeover doesn't
// depend on token inheritance.
const INK = "#15233b";
const SHELL = "#f6f2ea";
const TERRACOTTA = "#c45b3c";
const CORAL = "#e08e6f";
const STRAWBERRY = "#e07d93";

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

export const OnboardingCelebration = ({
  result,
  freeLimit,
  onContinue,
  billingActive = false,
  subscribing = false,
  onAddCredit,
}: Props) => {
  // Drive bar widths from a sliver on mount so they grow into place. A short
  // timeout (rather than rAF, which headless/background tabs throttle) reliably
  // flips us to the final widths even if the frame callback never fires.
  const [grown, setGrown] = useState(false);
  const focusedRef = useRef(false);
  useEffect(() => {
    const id = setTimeout(() => setGrown(true), 60);
    return () => clearTimeout(id);
  }, []);

  const savings = result?.ok ? result.savingsPct ?? null : null;
  const hasSavings = savings != null && savings > 0 && savings < 100;

  // Derived comparison numbers (only meaningful when we have a real first call).
  // Prefer the exact benchmark cost carried from the API; only reconstruct from
  // the (rounded) savings % as a fallback so the "Always Opus" figure and the
  // multiplier aren't distorted by integer rounding.
  const routed = result?.costUsd ?? null;
  const benchmarkCost =
    result?.benchmarkCostUsd != null
      ? result.benchmarkCostUsd
      : hasSavings && routed != null
        ? routed / (1 - savings / 100)
        : null;
  const rawMultiplier =
    benchmarkCost != null && routed != null && routed > 0
      ? benchmarkCost / routed
      : hasSavings
        ? 100 / (100 - savings)
        : null;
  // Cap the headline multiplier so a near-100% first call can't render "100x".
  const multiplier = rawMultiplier != null ? Math.min(rawMultiplier, 50) : null;
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
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Onboarding complete"
      ref={(el) => { if (el && !focusedRef.current) { focusedRef.current = true; el.focus(); } }}
      tabIndex={-1}
      className="nadir-brand fixed inset-0 z-[60] overflow-y-auto text-[#f6f2ea] outline-none"
      style={{ background: INK }}
    >
      {/* faint brand glow so the flat ink has some depth */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-1/3 right-[-10%] h-[70vh] w-[70vh] rounded-full opacity-[0.10] blur-3xl"
        style={{ background: `radial-gradient(circle, ${TERRACOTTA} 0%, transparent 70%)` }}
      />

      <div className="relative mx-auto flex min-h-screen max-w-5xl flex-col px-6 py-10 md:px-12 md:py-14">
        {/* Brand wordmark */}
        <div className="mb-10 inline-flex items-center gap-1.5">
          <span className="font-editorial text-[22px] leading-none tracking-[-0.01em] text-[#f6f2ea]">Nadir</span>
          <Sparkle className="h-3.5 w-3.5" color={STRAWBERRY} />
        </div>

        {/* Headline */}
        <h1
          className="font-editorial text-[64px] font-semibold leading-[0.95] text-[#f6f2ea] md:text-[104px] stat-reveal"
          style={{ ["--stat-delay" as string]: "60ms" }}
        >
          Nice job!
        </h1>

        <div className="mt-10 grid flex-1 items-center gap-y-12 md:mt-14 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,0.9fr)] lg:gap-x-8">
          {/* ── Left: the comparison ───────────────────────────────────── */}
          <div className="w-full max-w-md">
            <p
              className="font-editorial text-2xl tracking-tight text-[#f6f2ea] md:text-[28px] stat-reveal"
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
                  <div className="flex h-11 items-center rounded-[3px] px-4 transition-[width] duration-700 ease-out"
                    style={{ width: grown ? "100%" : "12%", background: "#e7ddcd" }}
                  >
                    <span className="font-mono text-[15px] font-semibold text-[#15233b]">
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
                  <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: CORAL }}>
                    With Nadir{result?.model ? ` · ${prettyModel(result.model)}` : ""}
                  </div>
                  <div className="flex items-center gap-3">
                    <div
                      className="h-11 shrink-0 rounded-[3px] transition-[width] duration-700 ease-out"
                      style={{ width: grown ? `${nadirBarPct}%` : "6%", transitionDelay: "120ms", background: TERRACOTTA }}
                    />
                    <span className="whitespace-nowrap font-mono text-[15px] font-semibold" style={{ color: CORAL }}>
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
                    className="flex items-center justify-between gap-3 rounded-[3px] bg-white/[0.06] px-4 py-3 text-[15px] font-medium text-white/90 stat-reveal"
                    style={{ ["--stat-delay" as string]: `${280 + i * 120}ms` }}
                  >
                    <span className="flex items-center gap-3">
                      <span aria-hidden="true" style={{ color: CORAL }}>✓</span>
                      {item.label}
                    </span>
                    <span className="text-[13px] font-semibold" style={{ color: CORAL }}>{item.status}</span>
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
              <path d="M8 40 C 70 20, 120 40, 118 95" stroke={CORAL} strokeWidth="2.5" strokeLinecap="round" fill="none" />
              {/* little loop for character */}
              <path d="M118 95 C 100 92, 96 112, 116 112 C 132 112, 130 90, 118 95" stroke={CORAL} strokeWidth="2.5" strokeLinecap="round" fill="none" />
              <path d="M116 112 C 122 122, 130 130, 140 134" stroke={CORAL} strokeWidth="2.5" strokeLinecap="round" fill="none" />
              <path d="M140 134 L 128 134 M140 134 L 137 122" stroke={CORAL} strokeWidth="2.5" strokeLinecap="round" />
            </svg>
          </div>

          {/* ── Right: the hero stat + CTA ──────────────────────────────── */}
          <div className="w-full">
            {hasSavings ? (
              <>
                <div
                  className="font-editorial font-semibold leading-[0.9] stat-reveal"
                  style={{ ["--stat-delay" as string]: "700ms" }}
                >
                  <span className="text-[88px] text-[#f6f2ea] md:text-[120px]">
                    {showMultiplier ? `${multiplierLabel}x ` : `${Math.round(savings)}% `}
                  </span>
                  <span className="text-[88px] italic md:text-[120px]" style={{ color: TERRACOTTA }}>
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
                  className="font-editorial font-semibold leading-[0.9] stat-reveal"
                  style={{ ["--stat-delay" as string]: "560ms" }}
                >
                  <span className="text-[64px] text-[#f6f2ea] md:text-[88px]">Routing's </span>
                  <span className="text-[64px] italic md:text-[88px]" style={{ color: TERRACOTTA }}>ready.</span>
                </div>
                <p
                  className="mt-3 max-w-sm text-base text-white/70 stat-reveal"
                  style={{ ["--stat-delay" as string]: "680ms" }}
                >
                  Send a real request and watch Nadir route it to the model that fits.
                  Typically 30 to 60% under always-Opus.
                </p>
              </>
            )}

            {/* CTA — re-offer the $5 top-up if they finished without adding credit */}
            {!billingActive && onAddCredit ? (
              <div
                className="mt-9 w-full max-w-sm space-y-3 stat-reveal"
                style={{ ["--stat-delay" as string]: hasSavings ? "940ms" : "800ms" }}
              >
                <div className="rounded-[3px] border border-white/15 bg-white/[0.04] p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-editorial text-[19px] text-[#f6f2ea]">Keep the savings going</span>
                    <span className="rounded-[2px] px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-[#15233b]" style={{ background: STRAWBERRY }}>
                      +$2
                    </span>
                  </div>
                  <p className="mt-1 text-[13px] text-white/60">
                    Add $5, get $7 of credit. No monthly fee, you only pay on what we save you.
                  </p>
                  <button
                    type="button"
                    onClick={onAddCredit}
                    disabled={subscribing}
                    aria-busy={subscribing}
                    className="press mt-3 flex w-full items-center justify-center gap-2 rounded-[2px] px-5 py-3 text-[12px] font-semibold uppercase tracking-[0.11em] text-[#f6f2ea] transition-opacity hover:opacity-90 disabled:opacity-60"
                    style={{ background: TERRACOTTA }}
                  >
                    {subscribing ? (
                      <><Loader2 className="h-4 w-4 animate-spin" /> Redirecting...</>
                    ) : (
                      <>Add $5, get $7 of credit <ArrowRight className="h-3.5 w-3.5" /></>
                    )}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={onContinue}
                  className="w-full text-center text-[13px] text-white/50 transition-colors hover:text-white/85"
                >
                  Skip for now, continue to dashboard
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={onContinue}
                className="press mt-9 w-full max-w-sm rounded-[2px] px-6 py-4 text-[13px] font-semibold uppercase tracking-[0.11em] text-[#15233b] transition-colors stat-reveal"
                style={{ ["--stat-delay" as string]: hasSavings ? "940ms" : "800ms", background: "#f0e4d4" }}
              >
                Continue to dashboard
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default OnboardingCelebration;
