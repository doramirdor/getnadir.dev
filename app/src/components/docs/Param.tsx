export const Param = ({
  name,
  type,
  required,
  children,
}: {
  name: string;
  type: string;
  required?: boolean;
  children: React.ReactNode;
}) => (
  <div className="flex flex-col gap-1 py-3 border-b border-border last:border-0">
    <div className="flex items-center gap-2">
      <code className="text-sm font-semibold text-foreground">{name}</code>
      <span className="text-xs text-muted-foreground font-mono">{type}</span>
      {required && (
        <span className="text-[10px] font-medium uppercase tracking-wider text-red-500">
          required
        </span>
      )}
    </div>
    <p className="text-sm text-muted-foreground">{children}</p>
  </div>
);
