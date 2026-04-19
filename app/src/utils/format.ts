/**
 * Formatting helpers shared across the admin dashboard.
 *
 * `formatUSD` is the canonical 2-decimal / thousand-separator formatter
 * used on metric cards, billing, and savings — e.g. `2184.619` → `"2,184.62"`.
 * The leading `$` is added at the call site so this can also feed into
 * compound strings like `"${fee.base} + ${fee.variable}"`.
 */

export function formatUSD(amount: number): string {
  return amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Short-form integers for metric cards: 1234 → "1.2K", 2_500_000 → "2.5M". */
export function formatCompactNumber(num: number): string {
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toString();
}
