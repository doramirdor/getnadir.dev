import { createContext, useContext, useState, useCallback, ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { KeyRound } from "lucide-react";

interface ApiKeyContextValue {
  /** Current raw API key, or null if not yet provided. */
  apiKey: string | null;
  /** Imperatively set the key (e.g. after creation). Stored in memory only. */
  setApiKey: (key: string) => void;
  /** Clear the stored key (e.g. on logout). */
  clearApiKey: () => void;
  /**
   * Opens the API-key prompt dialog. Use sparingly — prefer
   * rendering <ApiKeyBanner /> inline instead of calling this on mount.
   */
  requireApiKey: () => void;
}

const ApiKeyContext = createContext<ApiKeyContextValue | null>(null);

export function ApiKeyProvider({ children }: { children: ReactNode }) {
  // API key is held in React state only — never persisted to sessionStorage
  // or localStorage to prevent theft via XSS or browser extensions.
  const [key, setKey] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");

  const persist = useCallback((raw: string) => {
    setKey(raw);
  }, []);

  const clearApiKey = useCallback(() => {
    setKey(null);
  }, []);

  const requireApiKey = useCallback(() => {
    if (!key) setDialogOpen(true);
  }, [key]);

  const handleSubmit = () => {
    const trimmed = inputValue.trim();
    if (trimmed) {
      persist(trimmed);
      setDialogOpen(false);
      setInputValue("");
    }
  };

  return (
    <ApiKeyContext.Provider
      value={{ apiKey: key, setApiKey: persist, clearApiKey, requireApiKey }}
    >
      {children}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Enter your API Key</DialogTitle>
            <DialogDescription>
              Paste your Nadir API key to continue. The key is held in memory
              only and will be cleared when you close or refresh this tab.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="api-key-input">API Key</Label>
            <Input
              id="api-key-input"
              placeholder="sk-... or ndr_..."
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={!inputValue.trim()}>
              Save Key
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ApiKeyContext.Provider>
  );
}

export function useApiKey(): ApiKeyContextValue {
  const ctx = useContext(ApiKeyContext);
  if (!ctx) {
    throw new Error("useApiKey must be used within an <ApiKeyProvider>");
  }
  return ctx;
}

/**
 * Inline banner shown when a page needs an API key but none is stored.
 * Renders nothing when a key is already available.
 */
export function ApiKeyBanner() {
  const { apiKey, requireApiKey } = useApiKey();
  if (apiKey) return null;

  return (
    <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200 mb-6">
      <KeyRound className="h-4 w-4 shrink-0" />
      <span className="flex-1">
        An API key is required to use this page.
        The key is held in memory only and cleared on refresh.
      </span>
      <Button size="sm" variant="outline" onClick={requireApiKey} className="shrink-0">
        Enter API Key
      </Button>
    </div>
  );
}
