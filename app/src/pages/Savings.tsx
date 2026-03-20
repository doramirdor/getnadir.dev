import { TrendingDown, DollarSign, Percent, Zap } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from "recharts";
import { useQuery } from "@tanstack/react-query";
import { useApiKey } from "@/hooks/useApiKey";
import { SavingsAPI } from "@/services/savingsApi";
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
      totalSaved,
      totalSpent,
      savingsRate: totalSaved / (totalSaved + totalSpent),
      requestsRouted: Math.round(totalSaved * 12),
      nadisFee: fee,
      netSavings: totalSaved - fee,
    },
    daily,
    tiers: [
      { tier: "Simple", requests: 4200, saved: totalSaved * 0.55 },
      { tier: "Complex", requests: 1800, saved: totalSaved * 0.15 },
      { tier: "Reasoning", requests: 600, saved: totalSaved * 0.05 },
      { tier: "Context Optimize", requests: 6600, saved: totalSaved * 0.25 },
    ],
  };
}

// ── StatCard ─────────────────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, subtext, color = "blue" }: {
  icon: any; label: string; value: string; subtext?: string; color?: string;
}) {
  const colorMap: Record<string, string> = {
    blue: "bg-blue-50 text-blue-600",
    green: "bg-green-50 text-green-600",
    amber: "bg-amber-50 text-amber-600",
    purple: "bg-purple-50 text-purple-600",
  };

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-6">
      <div className="flex items-center gap-3 mb-3">
        <div className={`p-2 rounded-lg ${colorMap[color]}`}>
          <Icon className="h-5 w-5" />
        </div>
        <span className="text-sm text-gray-500">{label}</span>
      </div>
      <div className="text-2xl font-bold">{value}</div>
      {subtext && <div className="text-xs text-gray-400 mt-1">{subtext}</div>}
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────

export default function Savings() {
  const { apiKey } = useApiKey();

  const api = apiKey ? new SavingsAPI(apiKey) : null;

  // Fetch summary
  const { data: summaryData, isLoading: summaryLoading } = useQuery({
    queryKey: ["savings", "summary", apiKey],
    queryFn: () => api!.getSavingsSummary(),
    enabled: !!api,
    retry: 1,
    staleTime: 60_000,
  });

  // Fetch breakdown (tiers + daily)
  const { data: breakdownData, isLoading: breakdownLoading } = useQuery({
    queryKey: ["savings", "breakdown", apiKey],
    queryFn: () => api!.getSavingsBreakdown(),
    enabled: !!api,
    retry: 1,
    staleTime: 60_000,
  });

  const loading = summaryLoading || breakdownLoading;

  // Use API data if available, otherwise fall back to demo data
  const demo = generateDemoData();
  const hasRealData = !!summaryData && summaryData.requestsRouted > 0;

  const summary: SavingsSummary = hasRealData ? summaryData : demo.summary;
  const dailyData: DailySaving[] = hasRealData && breakdownData?.daily?.length
    ? breakdownData.daily
    : demo.daily;
  const tierData: TierBreakdown[] = hasRealData && breakdownData?.tiers?.length
    ? breakdownData.tiers
    : demo.tiers;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Savings</h1>
        <p className="text-gray-500 text-sm mt-1">
          How much Nadir saved you this billing period
        </p>
        {!hasRealData && (
          <p className="text-xs text-amber-600 mt-1">
            Showing demo data -- savings will appear once you start routing requests.
          </p>
        )}
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={DollarSign}
          label="Total Saved"
          value={`$${Math.round(summary.totalSaved).toLocaleString()}`}
          subtext="this month"
          color="green"
        />
        <StatCard
          icon={Percent}
          label="Savings Rate"
          value={`${Math.round(summary.savingsRate * 100)}%`}
          subtext="of benchmark cost"
          color="blue"
        />
        <StatCard
          icon={Zap}
          label="Requests Routed"
          value={summary.requestsRouted.toLocaleString()}
          subtext="intelligently classified"
          color="purple"
        />
        <StatCard
          icon={TrendingDown}
          label="Net Savings"
          value={`$${Math.round(summary.netSavings).toLocaleString()}`}
          subtext={`after $${Math.round(summary.nadisFee)} Nadir fee`}
          color="green"
        />
      </div>

      {/* Comparison banner */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-sm text-blue-700 font-medium">Without Nadir you would have spent</div>
          <div className="text-3xl font-bold text-blue-900">
            ${Math.round(summary.totalSaved + summary.totalSpent).toLocaleString()}
          </div>
        </div>
        <div className="text-center">
          <div className="text-sm text-blue-700 font-medium">With Nadir you spent</div>
          <div className="text-3xl font-bold text-blue-600">
            ${Math.round(summary.totalSpent).toLocaleString()}
          </div>
        </div>
        <div className="text-center">
          <div className="text-sm text-green-700 font-medium">You keep</div>
          <div className="text-3xl font-bold text-green-600">
            ${Math.round(summary.netSavings).toLocaleString()}
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Daily savings chart */}
        <div className="bg-white rounded-xl border border-gray-100 p-6">
          <h3 className="font-semibold mb-4">Daily Savings</h3>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={dailyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `$${v}`} />
              <Tooltip formatter={(v: number) => [`$${v.toFixed(2)}`, ""]} />
              <Area type="monotone" dataKey="saved" stroke="#22c55e" fill="#dcfce7" name="Saved" />
              <Area type="monotone" dataKey="spent" stroke="#3b82f6" fill="#dbeafe" name="Spent" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Tier breakdown */}
        <div className="bg-white rounded-xl border border-gray-100 p-6">
          <h3 className="font-semibold mb-4">Savings by Category</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={tierData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis type="number" tick={{ fontSize: 12 }} tickFormatter={(v) => `$${v}`} />
              <YAxis type="category" dataKey="tier" tick={{ fontSize: 12 }} width={120} />
              <Tooltip formatter={(v: number) => [`$${Math.round(v)}`, "Saved"]} />
              <Bar dataKey="saved" fill="#3b82f6" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Fee breakdown */}
      <div className="bg-white rounded-xl border border-gray-100 p-6">
        <h3 className="font-semibold mb-4">Fee Breakdown</h3>
        <div className="grid sm:grid-cols-4 gap-4 text-center">
          <div className="p-4 bg-gray-50 rounded-lg">
            <div className="text-sm text-gray-500">Base fee</div>
            <div className="text-lg font-bold">$9.00</div>
          </div>
          <div className="p-4 bg-gray-50 rounded-lg">
            <div className="text-sm text-gray-500">25% on first $2K saved</div>
            <div className="text-lg font-bold">${(Math.min(summary.totalSaved, 2000) * 0.25).toFixed(2)}</div>
          </div>
          <div className="p-4 bg-gray-50 rounded-lg">
            <div className="text-sm text-gray-500">10% above $2K saved</div>
            <div className="text-lg font-bold">${(Math.max(summary.totalSaved - 2000, 0) * 0.10).toFixed(2)}</div>
          </div>
          <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
            <div className="text-sm text-blue-700">Total Nadir fee</div>
            <div className="text-lg font-bold text-blue-600">${summary.nadisFee.toFixed(2)}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
