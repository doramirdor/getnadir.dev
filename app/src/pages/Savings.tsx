import { useEffect } from "react";
import { TrendingDown, DollarSign, Percent, Zap, Info } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Tooltip as UITooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { trackPageView } from "@/utils/analytics";
import type { SavingsSummary, DailySaving, TierBreakdown } from "@/services/savingsApi";

function calculateFee(totalSavings: number): number {
  const base = 9;
  const feeOnFirst2K = Math.min(totalSavings, 2000) * 0.25;
  const feeAbove2K = Math.max(totalSavings - 2000, 0) * 0.10;
  return base + feeOnFirst2K + feeAbove2K;
}

// ── Demo data fallback ──────────────────────────────────────────────────

function generateDemoData(): { summary: SavingsSummary; daily: DailySaving[]; tiers: TierBreakdown[] } {
  const daily = Array.from({ length: 14 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - 13 + i);
    const saved = Math.round(40 + Math.random() * 80);
    return {
      date: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      saved,
      spent: Math.round(saved * 0.55),
      benchmarkCost: Math.round(saved * 1.55),
    };
  });

  const totalSaved = daily.reduce((s, d) => s + d.saved, 0);
  const totalSpent = daily.reduce((s, d) => s + d.spent, 0);
  const fee = calculateFee(totalSaved);

  return {
    summary: {
      total_savings_usd: totalSaved,
      total_spent_usd: totalSpent,
      total_benchmark_usd: totalSaved + totalSpent,
      savings_rate: totalSaved / (totalSaved + totalSpent),
      requests_routed: Math.round(totalSaved * 12),
      base_fee: 9,
      savings_fee: fee - 9,
      total_fee: fee,
      net_savings: totalSaved - (fee - 9),
      period_start: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10),
      period_end: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1).toISOString().slice(0, 10),
    },
    daily,
    tiers: [
      { tier: "simple", requests: 4200, savings_usd: totalSaved * 0.25, avg_savings_per_request: (totalSaved * 0.25) / 4200, savings_pct: 0.93, benchmark_usd: totalSaved * 0.27, spent_usd: totalSaved * 0.02 },
      { tier: "mid", requests: 5200, savings_usd: totalSaved * 0.75, avg_savings_per_request: (totalSaved * 0.75) / 5200, savings_pct: 0.72, benchmark_usd: totalSaved * 1.05, spent_usd: totalSaved * 0.30 },
      { tier: "complex", requests: 2400, savings_usd: 0, avg_savings_per_request: 0, savings_pct: 0, benchmark_usd: totalSaved * 0.40, spent_usd: totalSaved * 0.40 },
    ],
  };
}

// ── Supabase-direct loader (RLS-scoped to the signed-in user) ───────────

interface SavingsRow {
  benchmark_cost_usd: number | null;
  routed_cost_usd: number | null;
  savings_usd: number | null;
  complexity_tier: string | null;
  created_at: string;
}

async function loadSavingsFromSupabase(): Promise<{ summary: SavingsSummary; daily: DailySaving[]; tiers: TierBreakdown[] } | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

  const { data: rows, error } = await supabase
    .from("savings_tracking")
    .select("benchmark_cost_usd, routed_cost_usd, savings_usd, complexity_tier, created_at")
    .eq("user_id", user.id)
    .gte("created_at", monthStart.toISOString())
    .lt("created_at", monthEnd.toISOString());

  if (error) throw error;
  if (!rows || rows.length === 0) return null;

  const typed = rows as SavingsRow[];
  const total_savings = typed.reduce((s, r) => s + Number(r.savings_usd || 0), 0);
  const total_spent = typed.reduce((s, r) => s + Number(r.routed_cost_usd || 0), 0);
  const total_benchmark = typed.reduce((s, r) => s + Number(r.benchmark_cost_usd || 0), 0);
  const savings_rate = total_benchmark > 0 ? total_savings / total_benchmark : 0;
  const fee = calculateFee(total_savings);

  // Daily aggregation — zero-pad missing days so the AreaChart stays continuous.
  const dailyMap = new Map<string, { saved: number; spent: number; benchmark: number }>();
  for (const r of typed) {
    const d = new Date(r.created_at);
    const key = d.toISOString().slice(0, 10); // YYYY-MM-DD for deterministic ordering
    const cur = dailyMap.get(key) ?? { saved: 0, spent: 0, benchmark: 0 };
    cur.saved += Number(r.savings_usd || 0);
    cur.spent += Number(r.routed_cost_usd || 0);
    cur.benchmark += Number(r.benchmark_cost_usd || 0);
    dailyMap.set(key, cur);
  }
  const daily: DailySaving[] = [];
  for (let d = new Date(monthStart); d < monthEnd && d <= now; d.setUTCDate(d.getUTCDate() + 1)) {
    const isoKey = d.toISOString().slice(0, 10);
    const label = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const v = dailyMap.get(isoKey) ?? { saved: 0, spent: 0, benchmark: 0 };
    daily.push({
      date: label,
      saved: Math.round(v.saved * 100) / 100,
      spent: Math.round(v.spent * 100) / 100,
      benchmarkCost: Math.round(v.benchmark * 100) / 100,
    });
  }

  // Tier breakdown — include per-tier benchmark + routed so we can show savings%.
  const tierMap = new Map<string, { requests: number; savings: number; benchmark: number; spent: number }>();
  for (const r of typed) {
    const tier = (r.complexity_tier || "unknown");
    const cur = tierMap.get(tier) ?? { requests: 0, savings: 0, benchmark: 0, spent: 0 };
    cur.requests += 1;
    cur.savings += Number(r.savings_usd || 0);
    cur.benchmark += Number(r.benchmark_cost_usd || 0);
    cur.spent += Number(r.routed_cost_usd || 0);
    tierMap.set(tier, cur);
  }
  const tiers: TierBreakdown[] = Array.from(tierMap.entries())
    .map(([tier, v]) => ({
      tier,
      requests: v.requests,
      savings_usd: Math.round(v.savings * 100) / 100,
      avg_savings_per_request: v.requests > 0 ? v.savings / v.requests : 0,
      savings_pct: v.benchmark > 0 ? v.savings / v.benchmark : 0,
      benchmark_usd: Math.round(v.benchmark * 100) / 100,
      spent_usd: Math.round(v.spent * 100) / 100,
    }))
    .sort((a, b) => b.savings_usd - a.savings_usd);

  // Net savings = gross savings minus the variable fee only.
  // We exclude the flat base fee because it's a subscription cost,
  // not a per-savings deduction.
  const savings_fee = fee - 9;

  return {
    summary: {
      total_savings_usd: total_savings,
      total_spent_usd: total_spent,
      total_benchmark_usd: total_benchmark,
      savings_rate,
      requests_routed: typed.length,
      base_fee: 9,
      savings_fee,
      total_fee: fee,
      net_savings: total_savings - savings_fee,
      period_start: monthStart.toISOString().slice(0, 10),
      period_end: monthEnd.toISOString().slice(0, 10),
    },
    daily,
    tiers,
  };
}

// ── StatCard ─────────────────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, subtext, color = "blue", info }: {
  icon: any; label: string; value: string; subtext?: string; color?: string; info?: React.ReactNode;
}) {
  const colorMap: Record<string, string> = {
    blue: "bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300",
    green: "bg-green-50 text-green-600 dark:bg-emerald-950/40 dark:text-emerald-300",
    amber: "bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300",
    purple: "bg-purple-50 text-purple-600 dark:bg-purple-950/40 dark:text-purple-300",
  };

  return (
    <div className="bg-card rounded-xl border border-border p-6">
      <div className="flex items-center gap-3 mb-3">
        <div className={`p-2 rounded-lg ${colorMap[color]}`}>
          <Icon className="h-5 w-5" />
        </div>
        <span className="text-sm text-muted-foreground flex items-center gap-1">
          {label}
          {info && (
            <TooltipProvider delayDuration={100}>
              <UITooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label={`How ${label} is calculated`}
                    className="text-muted-foreground/70 hover:text-foreground"
                  >
                    <Info className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs text-xs leading-relaxed">
                  {info}
                </TooltipContent>
              </UITooltip>
            </TooltipProvider>
          )}
        </span>
      </div>
      <div className="text-2xl font-bold text-foreground">{value}</div>
      {subtext && <div className="text-xs text-muted-foreground/80 mt-1">{subtext}</div>}
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────

export default function Savings() {
  useEffect(() => { trackPageView("savings"); }, []);

  const { data: real, isLoading } = useQuery({
    queryKey: ["savings", "supabase"],
    queryFn: loadSavingsFromSupabase,
    retry: 1,
    staleTime: 60_000,
  });

  const hasRealData = !!real && real.summary.requests_routed > 0;

  const demo = generateDemoData();
  const summary: SavingsSummary = hasRealData ? real!.summary : demo.summary;
  const dailyData: DailySaving[] = hasRealData && real!.daily.length ? real!.daily : demo.daily;
  const tierData: TierBreakdown[] = hasRealData && real!.tiers.length ? real!.tiers : demo.tiers;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Savings</h1>
        <p className="text-muted-foreground text-sm mt-1">
          How much Nadir saved you this billing period
        </p>
        {!hasRealData && (
          <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
            Showing demo data -- savings will appear once you start routing requests.
          </p>
        )}
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={DollarSign}
          label="Total Saved"
          value={`$${Math.round(summary.total_savings_usd).toLocaleString()}`}
          subtext="this month"
          color="green"
        />
        <StatCard
          icon={Percent}
          label="Savings Rate"
          value={`${Math.round(summary.savings_rate * 100)}%`}
          subtext="of benchmark cost"
          color="blue"
        />
        <StatCard
          icon={Zap}
          label="Requests Routed"
          value={summary.requests_routed.toLocaleString()}
          subtext="intelligently classified"
          color="purple"
        />
        <StatCard
          icon={TrendingDown}
          label="Net Savings"
          value={`$${Math.round(summary.net_savings).toLocaleString()}`}
          subtext={`after $${summary.savings_fee.toFixed(2)} variable fee`}
          color="green"
          info={
            <div className="space-y-1">
              <div className="font-semibold">How this is calculated</div>
              <div>
                Gross saved: <b>${summary.total_savings_usd.toFixed(2)}</b>
                <span className="opacity-70"> (benchmark − routed spend)</span>
              </div>
              <div>
                Variable fee: <b>${summary.savings_fee.toFixed(2)}</b>
                <span className="opacity-70"> (25% of first $2K saved, 10% above)</span>
              </div>
              <div>
                Net savings: <b>${summary.net_savings.toFixed(2)}</b>
                <span className="opacity-70"> = gross saved − variable fee</span>
              </div>
              <div className="pt-1 opacity-70">
                The $9/mo base fee is billed separately as a flat subscription
                and not deducted from net savings.
              </div>
            </div>
          }
        />
      </div>

      {/* Comparison banner */}
      <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/50 rounded-xl p-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-sm text-blue-700 dark:text-blue-300 font-medium">Without Nadir you would have spent</div>
          <div className="text-3xl font-bold text-blue-900 dark:text-blue-100">
            ${Math.round(summary.total_savings_usd + summary.total_spent_usd).toLocaleString()}
          </div>
        </div>
        <div className="text-center">
          <div className="text-sm text-blue-700 dark:text-blue-300 font-medium">With Nadir you spent</div>
          <div className="text-3xl font-bold text-blue-600 dark:text-blue-300">
            ${Math.round(summary.total_spent_usd).toLocaleString()}
          </div>
        </div>
        <div className="text-center">
          <div className="text-sm text-emerald-700 dark:text-emerald-300 font-medium">You keep</div>
          <div className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">
            ${Math.round(summary.net_savings).toLocaleString()}
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Daily savings chart */}
        <div className="bg-card rounded-xl border border-border p-6">
          <div className="flex items-baseline justify-between mb-1">
            <h3 className="font-semibold text-foreground">Daily Savings</h3>
            <span className="text-xs text-muted-foreground/80">this month, USD per day</span>
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            <span className="inline-flex items-center gap-1.5 mr-3">
              <span className="inline-block w-2.5 h-2.5 rounded-sm bg-emerald-400 dark:bg-emerald-500" />
              <span><b className="text-foreground">Saved</b> — what Nadir kept off your bill vs always-Opus</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block w-2.5 h-2.5 rounded-sm bg-blue-400 dark:bg-blue-500" />
              <span><b className="text-foreground">Spent</b> — what you actually paid after routing</span>
            </span>
          </p>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={dailyData} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                stroke="hsl(var(--border))"
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                stroke="hsl(var(--border))"
                tickFormatter={(v) => `$${v}`}
                width={44}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--popover))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 8,
                  color: "hsl(var(--popover-foreground))",
                  fontSize: 12,
                }}
                itemStyle={{ color: "hsl(var(--popover-foreground))" }}
                labelStyle={{ color: "hsl(var(--popover-foreground))" }}
                formatter={(v: number, name: string) => [`$${v.toFixed(2)}`, name]}
              />
              <Legend
                verticalAlign="bottom"
                height={24}
                iconType="square"
                wrapperStyle={{ fontSize: 12, color: "hsl(var(--muted-foreground))" }}
              />
              <Area
                type="monotone"
                dataKey="saved"
                stackId="1"
                stroke="#22c55e"
                fill="#22c55e"
                fillOpacity={0.35}
                name="Saved vs Opus"
              />
              <Area
                type="monotone"
                dataKey="spent"
                stackId="1"
                stroke="#3b82f6"
                fill="#3b82f6"
                fillOpacity={0.35}
                name="You spent"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Tier breakdown — annotated list with per-tier savings %.
            Bars stay useful even when a tier (e.g. complex) saves $0
            because the label explains *why* (always routed to benchmark). */}
        <div className="bg-card rounded-xl border border-border p-6">
          <div className="flex items-baseline justify-between mb-4">
            <h3 className="font-semibold text-foreground">Savings by Category</h3>
            <span className="text-xs text-muted-foreground/80">routed model vs always-Opus 4.6</span>
          </div>
          <div className="space-y-4">
            {tierData.map((t) => {
              const label = { simple: "Simple", mid: "Medium", complex: "Complex" }[t.tier] ?? t.tier;
              const pct = typeof t.savings_pct === "number" ? t.savings_pct : 0;
              const maxSaved = Math.max(1, ...tierData.map((x) => x.savings_usd));
              const barWidth = Math.max(4, (t.savings_usd / maxSaved) * 100);
              const zero = t.savings_usd <= 0.005;
              return (
                <div key={t.tier}>
                  <div className="flex items-center justify-between text-sm mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground">{label}</span>
                      <span className="text-xs text-muted-foreground/80">{t.requests.toLocaleString()} req</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-xs font-medium ${zero ? "text-muted-foreground/80" : "text-emerald-600 dark:text-emerald-400"}`}>
                        {zero ? "0%" : `${Math.round(pct * 100)}% cheaper`}
                      </span>
                      <span className="font-semibold text-foreground tabular-nums">
                        ${t.savings_usd.toFixed(2)}
                      </span>
                    </div>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${zero ? "bg-muted-foreground/20" : "bg-emerald-500"}`}
                      style={{ width: `${zero ? 0 : barWidth}%` }}
                    />
                  </div>
                  {zero && (
                    <div className="text-[11px] text-muted-foreground/80 mt-1">
                      Always routed to the benchmark model — no savings by design.
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Fee breakdown */}
      <div className="bg-card rounded-xl border border-border p-6">
        <h3 className="font-semibold mb-4 text-foreground">Fee Breakdown</h3>
        <div className="grid sm:grid-cols-4 gap-4 text-center">
          <div className="p-4 bg-muted rounded-lg">
            <div className="text-sm text-muted-foreground">Base fee</div>
            <div className="text-lg font-bold text-foreground">$9.00</div>
          </div>
          <div className="p-4 bg-muted rounded-lg">
            <div className="text-sm text-muted-foreground">25% on first $2K saved</div>
            <div className="text-lg font-bold text-foreground">${(Math.min(summary.total_savings_usd, 2000) * 0.25).toFixed(2)}</div>
          </div>
          <div className="p-4 bg-muted rounded-lg">
            <div className="text-sm text-muted-foreground">10% above $2K saved</div>
            <div className="text-lg font-bold text-foreground">${(Math.max(summary.total_savings_usd - 2000, 0) * 0.10).toFixed(2)}</div>
          </div>
          <div className="p-4 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-900/50">
            <div className="text-sm text-blue-700 dark:text-blue-300">Total Nadir fee</div>
            <div className="text-lg font-bold text-blue-600 dark:text-blue-300">${summary.total_fee.toFixed(2)}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
