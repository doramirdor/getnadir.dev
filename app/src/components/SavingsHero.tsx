import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ArrowRight } from "lucide-react";
import { Sparkle } from "@/components/brand/motifs";

// ROI centerpiece for the dashboard home. Surfaces the user's real savings this
// month (savings_tracking) in the blueprint language — the value proof that
// makes paying feel worth it. Scoped to `.nadir-brand` so it wears the
// editorial look while the rest of the dashboard stays on shadcn for now.

// Mirror of the Savings page fee math: 25% of the first $2K saved, 10% above.
// Base fee (if any) is billed separately and is NOT deducted here.
function calculateFee(totalSavings: number): number {
  const feeOnFirst2K = Math.min(totalSavings, 2000) * 0.25;
  const feeAbove2K = Math.max(totalSavings - 2000, 0) * 0.1;
  return feeOnFirst2K + feeAbove2K;
}

const fmt = (n: number): string =>
  n >= 100 ? `$${n.toFixed(0)}` : n >= 1 ? `$${n.toFixed(2)}` : `$${n.toFixed(3)}`;

interface Totals {
  gross: number;
  spent: number;
  benchmark: number;
  count: number;
}

export function SavingsHero() {
  const [state, setState] = useState<"loading" | "empty" | "show">("loading");
  const [t, setT] = useState<Totals>({ gross: 0, spent: 0, benchmark: 0, count: 0 });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { if (!cancelled) setState("empty"); return; }
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const { data: rows } = await supabase
        .from("savings_tracking")
        .select("benchmark_cost_usd, routed_cost_usd, savings_usd")
        .eq("user_id", user.id)
        .gte("created_at", monthStart.toISOString());
      if (cancelled) return;
      const list = rows || [];
      if (list.length === 0) { setState("empty"); return; }
      const totals = list.reduce<Totals>(
        (acc, r: any) => ({
          gross: acc.gross + (Number(r.savings_usd) || 0),
          spent: acc.spent + (Number(r.routed_cost_usd) || 0),
          benchmark: acc.benchmark + (Number(r.benchmark_cost_usd) || 0),
          count: acc.count + 1,
        }),
        { gross: 0, spent: 0, benchmark: 0, count: 0 },
      );
      setT(totals);
      setState("show");
    })();
    return () => { cancelled = true; };
  }, []);

  if (state === "loading") {
    return <div className="mb-2 h-[132px] w-full animate-pulse rounded-[3px] bg-muted/40" />;
  }

  if (state === "empty") {
    return (
      <div className="nadir-brand">
        <div className="relative overflow-hidden rounded-[3px] border border-dashed border-[var(--ink)]/30 bg-[var(--paper)] p-6">
          <span className="eyebrow text-[var(--ink)]/55">Savings this month</span>
          <h2 className="mt-2 font-editorial text-[26px] leading-tight text-[var(--ink)]">
            Your savings{" "}
            <span className="whitespace-nowrap">
              <span className="italic text-[var(--strawberry)]">start here.</span>
              <Sparkle className="twinkle inline-block h-3.5 w-3.5 align-super" color="var(--strawberry)" />
            </span>
          </h2>
          <p className="mt-2 max-w-md text-[13.5px] leading-relaxed text-[var(--ink)]/65">
            Route your first request and watch Nadir drop it to the model that fits.
            Typically 60% below always-Opus, with quality kept.
          </p>
          <Link
            to="/dashboard/playground"
            className="press mt-4 inline-flex items-center gap-2 rounded-[2px] bg-[var(--ink)] px-4 py-2.5 text-[11.5px] font-semibold uppercase tracking-[0.1em] text-[var(--shell)] no-underline transition-colors hover:bg-[var(--ink-soft)]"
          >
            Open the playground <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    );
  }

  const ratePct = t.benchmark > 0 ? Math.round((t.gross / t.benchmark) * 100) : 0;
  const net = Math.max(0, t.gross - calculateFee(t.gross));
  const nadirBarPct = t.benchmark > 0 ? Math.max(5, Math.round((t.spent / t.benchmark) * 100)) : 100;

  return (
    <div className="nadir-brand">
      <div className="relative overflow-hidden rounded-[3px] border-[1.5px] border-[var(--ink)] bg-[var(--paper)] p-5 sm:p-6">
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          {/* headline number */}
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="eyebrow text-[var(--ink)]/55">Saved this month</span>
              <Sparkle className="twinkle h-3 w-3" color="var(--strawberry)" />
            </div>
            <div className="mt-1.5 font-editorial text-[clamp(34px,5vw,52px)] leading-none text-[var(--terracotta)]">
              {fmt(t.gross)}
            </div>
            <p className="mt-2 text-[13.5px] text-[var(--ink)]/65">
              <span className="font-semibold text-[var(--ink)]">{ratePct}%</span> below always-Opus
              {" · "}{t.count.toLocaleString()} request{t.count === 1 ? "" : "s"} routed
            </p>
            <p className="mt-1 text-[12px] text-[var(--ink)]/50">
              You keep <span className="font-medium text-[var(--ink)]/75">{fmt(net)}</span> after Nadir's fee.{" "}
              <Link to="/dashboard/savings" className="ed-link text-[var(--terracotta)] no-underline">See the full breakdown →</Link>
            </p>
          </div>

          {/* comparison bars */}
          <div className="w-full shrink-0 md:w-[280px]">
            <div className="mb-1 flex items-center justify-between font-mono text-[10px] uppercase tracking-wider text-[var(--ink)]/50">
              <span>Always Opus</span>
              <span>{fmt(t.benchmark)}</span>
            </div>
            <div className="h-3 w-full rounded-[2px] bg-[var(--blush)]" />
            <div className="mb-1 mt-3 flex items-center justify-between font-mono text-[10px] uppercase tracking-wider text-[var(--terracotta)]">
              <span>With Nadir</span>
              <span>{fmt(t.spent)}</span>
            </div>
            <div className="h-3 rounded-[2px] bg-[var(--terracotta)]" style={{ width: `${nadirBarPct}%` }} />
          </div>
        </div>
      </div>
    </div>
  );
}

export default SavingsHero;
