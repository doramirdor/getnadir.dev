import { Info, AlertTriangle, Lightbulb } from "lucide-react";

const variants = {
  tip: {
    icon: Lightbulb,
    border: "border-emerald-200 dark:border-emerald-900/50",
    bg: "bg-emerald-50 dark:bg-emerald-950/30",
    text: "text-emerald-800 dark:text-emerald-200",
    label: "Tip",
  },
  warning: {
    icon: AlertTriangle,
    border: "border-amber-200 dark:border-amber-900/50",
    bg: "bg-amber-50 dark:bg-amber-950/30",
    text: "text-amber-800 dark:text-amber-200",
    label: "Warning",
  },
  info: {
    icon: Info,
    border: "border-blue-200 dark:border-blue-900/50",
    bg: "bg-blue-50 dark:bg-blue-950/30",
    text: "text-blue-800 dark:text-blue-200",
    label: "Info",
  },
};

export const Callout = ({
  type = "info",
  children,
}: {
  type?: "tip" | "warning" | "info";
  children: React.ReactNode;
}) => {
  const v = variants[type];
  const Icon = v.icon;

  return (
    <div
      className={`rounded-lg border ${v.border} ${v.bg} p-4 text-sm ${v.text}`}
    >
      <div className="flex gap-3">
        <Icon className="h-5 w-5 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-semibold">{v.label}</p>
          <div>{children}</div>
        </div>
      </div>
    </div>
  );
};
