import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// Mock Supabase client — recursive proxy so chained calls (.select().eq().order()…) never throw
vi.mock("@/integrations/supabase/client", () => {
  const chainProxy: () => any = () =>
    new Proxy(vi.fn().mockReturnValue(Promise.resolve({ data: [], error: null })), {
      get(_target, prop) {
        if (prop === "then") return undefined; // allow await to resolve
        return chainProxy();
      },
    });

  return {
    supabase: {
      auth: {
        getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
        getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
        onAuthStateChange: vi.fn().mockReturnValue({
          data: { subscription: { unsubscribe: vi.fn() } },
        }),
        signOut: vi.fn().mockResolvedValue({ error: null }),
      },
      from: chainProxy(),
      functions: { invoke: vi.fn().mockResolvedValue({ data: null, error: null }) },
      rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    },
  };
});

// Mock useAuth hook
vi.mock("@/hooks/useAuth", () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuth: () => ({ user: null, session: null, loading: false, signOut: vi.fn() }),
}));
import React from "react";

// Mock useApiKey hook
vi.mock("@/hooks/useApiKey", () => ({
  ApiKeyProvider: ({ children }: { children: React.ReactNode }) => children,
  useApiKey: () => ({
    apiKey: "test-key",
    setApiKey: vi.fn(),
    clearApiKey: vi.fn(),
    requireApiKey: vi.fn(),
  }),
}));

// Mock window.matchMedia
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock ResizeObserver
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};
