import { useState } from "react";
import { Copy, Check } from "lucide-react";

export const CodeBlock = ({
  children,
  label,
}: {
  children: string;
  label?: string;
}) => {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(children);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative rounded-lg border border-border bg-muted/30 text-sm font-mono overflow-hidden">
      {label && (
        <div className="flex items-center justify-between border-b border-border px-4 py-2 text-xs text-muted-foreground font-sans">
          <span>{label}</span>
          <button
            onClick={copy}
            className="flex items-center gap-1 hover:text-foreground transition-colors"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      )}
      {!label && (
        <button
          onClick={copy}
          className="absolute top-2 right-2 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
        </button>
      )}
      <pre className="overflow-x-auto whitespace-pre p-4 text-foreground leading-relaxed">
        {children}
      </pre>
    </div>
  );
};
