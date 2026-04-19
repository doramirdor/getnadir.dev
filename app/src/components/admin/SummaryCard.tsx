import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Admin summary card — the tinted-icon stat tile used at the top of the
 * Logs, ApiKeys, Savings, and Analytics screens in the Nadir Design System.
 *
 * Layout (matches ui_kits/admin/LogsScreen.jsx `SummaryCard`):
 *   ┌─────────────────────────────┐
 *   │ Label                 [◆]   │   40x40 tinted rounded square, 18px icon
 *   │ Value                       │   24px bold, tabular nums
 *   │ (optional Subtext)          │
 *   └─────────────────────────────┘
 *
 * `tint` maps to the admin semantic palette tokens in index.css so the card
 * flips correctly across light/dark themes.
 */
export type SummaryCardTint = "blue" | "ok" | "warn" | "err" | "violet" | "neutral";

const TINT_CLASSES: Record<SummaryCardTint, string> = {
  blue:    "bg-[hsl(var(--brand-blue-soft))] text-[hsl(var(--brand-blue-strong))]",
  ok:      "bg-[hsl(var(--ok-bg))]           text-[hsl(var(--ok))]",
  warn:    "bg-[hsl(var(--warn-bg))]         text-[hsl(var(--warn))]",
  err:     "bg-[hsl(var(--err-bg))]          text-[hsl(var(--err))]",
  violet:  "bg-[hsl(var(--violet-bg))]       text-[hsl(var(--violet))]",
  neutral: "bg-muted                         text-muted-foreground",
};

interface SummaryCardProps {
  label: string;
  value: string;
  subtext?: string;
  icon: LucideIcon;
  tint?: SummaryCardTint;
  className?: string;
}

export const SummaryCard = ({
  label,
  value,
  subtext,
  icon: Icon,
  tint = "blue",
  className,
}: SummaryCardProps) => {
  return (
    <div className={cn("clean-card p-6", className)}>
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-muted-foreground mb-1.5 truncate">
            {label}
          </p>
          <p className="mono text-[24px] font-bold tracking-tight text-foreground leading-none">
            {value}
          </p>
          {subtext && (
            <p className="text-[11px] text-muted-foreground/80 mt-2">{subtext}</p>
          )}
        </div>
        <div
          className={cn(
            "w-10 h-10 rounded-[10px] flex items-center justify-center flex-shrink-0",
            TINT_CLASSES[tint]
          )}
        >
          <Icon className="w-[18px] h-[18px]" strokeWidth={1.75} />
        </div>
      </div>
    </div>
  );
};
