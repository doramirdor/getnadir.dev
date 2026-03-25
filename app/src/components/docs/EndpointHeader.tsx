const methodColors: Record<string, string> = {
  GET: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  POST: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  PUT: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  PATCH: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
  DELETE: "bg-red-500/10 text-red-600 dark:text-red-400",
};

export const EndpointHeader = ({
  method,
  path,
}: {
  method: string;
  path: string;
}) => (
  <div className="flex items-center gap-3 mb-6">
    <span
      className={`text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded ${methodColors[method] || "bg-muted text-foreground"}`}
    >
      {method}
    </span>
    <code className="text-sm font-semibold text-foreground">{path}</code>
  </div>
);
