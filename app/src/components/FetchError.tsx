import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface FetchErrorProps {
  message?: string;
  onRetry?: () => void;
}

const FetchError = ({ message = "Failed to load data", onRetry }: FetchErrorProps) => (
  <div className="flex items-center gap-3 p-4 rounded-lg border border-red-200 bg-red-50 text-sm">
    <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
    <span className="text-red-700 flex-1">{message}</span>
    {onRetry && (
      <Button variant="outline" size="sm" onClick={onRetry} className="shrink-0">
        <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
        Retry
      </Button>
    )}
  </div>
);

export default FetchError;
