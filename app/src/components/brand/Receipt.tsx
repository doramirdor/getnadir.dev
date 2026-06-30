/**
 * Nadir — Routing receipt.
 *
 * The product's signature object: every request comes back with a receipt.
 * Four pipeline stages (Understand → Retrieve → Reason → Verify) on the left,
 * the routing ledger on the right (selected model, confidence, tokens, cost,
 * route id, timestamp), a perforated tear edge, and the "Verified by Nadir"
 * seal. Set in mono with tabular figures so it reads like a printed slip.
 *
 * Numbers are illustrative of a single routed request and intentionally
 * conservative — the headline cascade ships the Haiku-class answer once the
 * verifier accepts it; the "Reason" row is the tier that produced the shipped
 * answer.
 */
import { VerifierSeal } from "./motifs";

type Stage = { label: string; model: string; ms: string; active?: boolean };

const STAGES: Stage[] = [
  { label: "Understand", model: "Haiku 4.5", ms: "128 ms" },
  { label: "Retrieve", model: "Embed v3", ms: "96 ms" },
  { label: "Reason", model: "Sonnet 4.6", ms: "826 ms", active: true },
  { label: "Verify", model: "Haiku 4.5", ms: "112 ms" },
];

const LEDGER: [string, string][] = [
  ["Model", "Sonnet 4.6"],
  ["Confidence", "0.91"],
  ["Tokens in / out", "1,247 / 482"],
  ["Cost", "$0.0021"],
  ["Route ID", "rt_9f3a7e2c"],
  ["Time", "Jun 29  10:42:31"],
];

export function RoutingReceipt({ className = "" }: { className?: string }) {
  return (
    <div
      className={`relative bg-[var(--paper)] ${className}`}
      style={{
        boxShadow: "0 28px 60px -28px rgba(21,35,59,0.42), 0 2px 0 rgba(21,35,59,0.05)",
        // Perforated top + bottom edges via a tiny radial scallop.
        borderImage: "none",
      }}
    >
      {/* perforated edges */}
      <Perforation position="top" />
      <Perforation position="bottom" />

      <div className="px-6 pt-6 pb-7 sm:px-7">
        {/* header */}
        <div className="flex items-center justify-between border-b border-dashed border-[var(--line)] pb-3">
          <span className="eyebrow text-[var(--graphite)]">Routing Receipt</span>
          <div className="flex items-center gap-2">
            <span className="font-editorial italic text-[22px] leading-none text-[var(--ink)]">nadir</span>
          </div>
        </div>

        <div className="flex items-center gap-2 pt-3 pb-4">
          <span className="h-2 w-2 rounded-full bg-[var(--sage)]" />
          <span className="font-mono text-[12px] tracking-wide text-[var(--ink)]">Routed</span>
          <span className="font-mono text-[11px] text-[var(--graphite)]/70 ml-auto">verified · escalated 0×</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-[1.1fr_0.9fr] gap-x-7 gap-y-1">
          {/* stages */}
          <ol className="space-y-0">
            {STAGES.map((s, i) => (
              <li
                key={s.label}
                className="flex items-center gap-3 py-[7px] border-b border-dotted border-[var(--line-soft)] last:border-b-0"
              >
                <span
                  className={`grid place-items-center h-5 w-5 rounded-full shrink-0 text-[10px] font-mono ${
                    s.active
                      ? "bg-[var(--terracotta)] text-[var(--shell)]"
                      : "border border-[var(--line)] text-[var(--graphite)]"
                  }`}
                >
                  {i + 1}
                </span>
                <span className={`text-[13px] ${s.active ? "text-[var(--terracotta)] font-medium" : "text-[var(--ink)]"}`}>
                  {s.label}
                </span>
                <span className="font-mono text-[11px] text-[var(--graphite)]/70 ml-1">{s.model}</span>
                <span className="font-mono text-[11px] text-[var(--ink)] ml-auto tabular-nums">{s.ms}</span>
              </li>
            ))}
          </ol>

          {/* ledger */}
          <dl className="sm:border-l sm:border-dashed sm:border-[var(--line)] sm:pl-7 pt-3 sm:pt-0 space-y-[7px]">
            {LEDGER.map(([k, v]) => (
              <div key={k} className="flex items-baseline justify-between gap-3">
                <dt className="font-mono text-[11px] uppercase tracking-wider text-[var(--graphite)]/65">{k}</dt>
                <dd className="font-mono text-[12px] text-[var(--ink)] tabular-nums">{v}</dd>
              </div>
            ))}
          </dl>
        </div>

        {/* total */}
        <div className="mt-4 flex items-center justify-between border-t border-dashed border-[var(--line)] pt-3">
          <span className="font-mono text-[11px] uppercase tracking-wider text-[var(--graphite)]/65">Total latency</span>
          <span className="font-mono text-[14px] font-medium text-[var(--ink)] tabular-nums">1,162 ms</span>
        </div>

        {/* footer */}
        <div className="mt-5 flex items-end justify-between">
          <button className="font-mono text-[11px] uppercase tracking-wider text-[var(--terracotta)] ed-link">
            View full trace →
          </button>
          <div className="flex items-center gap-2">
            <VerifierSeal className="h-14 w-14 opacity-90" color="var(--ink)" />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Receipt perforation — a row of half-circle scallops bitten out of the edge. */
function Perforation({ position }: { position: "top" | "bottom" }) {
  return (
    <div
      className={`absolute left-0 right-0 h-2 ${position === "top" ? "-top-[1px]" : "-bottom-[1px]"}`}
      style={{
        backgroundImage:
          "radial-gradient(circle 4px at 8px 50%, var(--shell) 99%, transparent 100%)",
        backgroundSize: "16px 8px",
        backgroundRepeat: "repeat-x",
        backgroundPosition: position === "top" ? "0 0" : "0 100%",
      }}
      aria-hidden="true"
    />
  );
}
