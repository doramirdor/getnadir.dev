
import { Suspense, lazy, useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { ApiKeyProvider } from "@/hooks/useApiKey";
import { ThemeProvider } from "next-themes";
import ErrorBoundary from "./components/ErrorBoundary";
import Layout from "./components/Layout";
import { Dashboard } from "./components/Dashboard";
import { useToast } from "@/hooks/use-toast";

// Lazy-loaded page components
const Homepage = lazy(() => import("./pages/Homepage"));
const Analytics = lazy(() => import("./pages/Analytics"));
const ApiKeys = lazy(() => import("./pages/ApiKeys"));
const Billing = lazy(() => import("./pages/Billing"));
const Logs = lazy(() => import("./pages/Logs"));
const Settings = lazy(() => import("./pages/Settings"));
const IntegrationsBYOK = lazy(() => import("./pages/IntegrationsBYOK"));
const Onboarding = lazy(() => import("./pages/Onboarding"));
const Pricing = lazy(() => import("./pages/Pricing"));
const Savings = lazy(() => import("./pages/Savings"));
const Blog = lazy(() => import("./pages/Blog"));
const BlogPost = lazy(() => import("./pages/BlogPost"));
const Docs = lazy(() => import("./pages/Docs"));
const Privacy = lazy(() => import("./pages/Privacy"));
const Terms = lazy(() => import("./pages/Terms"));
const Auth = lazy(() => import("./pages/Auth"));
const NotFound = lazy(() => import("./pages/NotFound"));

const PageLoader = () => (
  <div className="flex items-center justify-center h-64">
    <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
  </div>
);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

/** Catches unhandled promise rejections that React's ErrorBoundary cannot see. */
const GlobalAsyncErrorHandler = () => {
  const { toast } = useToast();

  useEffect(() => {
    const handler = (event: PromiseRejectionEvent) => {
      if (event.reason?.name === "AbortError") return;
      console.error("Unhandled promise rejection:", event.reason);
      toast({
        variant: "destructive",
        title: "Unexpected Error",
        description:
          event.reason?.message ||
          "Something went wrong. Please refresh and try again.",
      });
    };

    window.addEventListener("unhandledrejection", handler);
    return () => window.removeEventListener("unhandledrejection", handler);
  }, [toast]);

  return null;
};

const App = () => (
  <ErrorBoundary>
  <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <ApiKeyProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <GlobalAsyncErrorHandler />
        <BrowserRouter>
          <Suspense fallback={<PageLoader />}>
          <Routes>
            {/* Public pages */}
            <Route path="/" element={<Homepage />} />
            <Route path="/pricing" element={<Pricing />} />
            <Route path="/blog" element={<Blog />} />
            <Route path="/blog/:id" element={<BlogPost />} />
            <Route path="/docs/:section?" element={<Docs />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/auth" element={<Auth />} />

            {/* Dashboard (authenticated) */}
            <Route path="/dashboard" element={<Layout />}>
              <Route index element={<Dashboard />} />
              <Route path="analytics" element={<Analytics />} />
              <Route path="savings" element={<Savings />} />
              <Route path="api-keys" element={<ApiKeys />} />
              <Route path="integrations" element={<IntegrationsBYOK />} />
              <Route path="billing" element={<Billing />} />
              <Route path="logs" element={<Logs />} />
              <Route path="settings" element={<Settings />} />
              <Route path="onboarding" element={<Onboarding />} />
            </Route>

            <Route path="*" element={<NotFound />} />
          </Routes>
          </Suspense>
        </BrowserRouter>
      </TooltipProvider>
      </ApiKeyProvider>
    </AuthProvider>
  </QueryClientProvider>
  </ThemeProvider>
  </ErrorBoundary>
);

export default App;
