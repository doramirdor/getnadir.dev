
import { Suspense, lazy, useEffect } from "react";
import { useLocation } from "react-router-dom";
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
const Referrals = lazy(() => import("./pages/Referrals"));
const Pricing = lazy(() => import("./pages/Pricing"));
const Savings = lazy(() => import("./pages/Savings"));
const Blog = lazy(() => import("./pages/Blog"));
const BlogPost = lazy(() => import("./pages/BlogPost"));
const Docs = lazy(() => import("./pages/Docs"));
const Privacy = lazy(() => import("./pages/Privacy"));
const Terms = lazy(() => import("./pages/Terms"));
const Auth = lazy(() => import("./pages/Auth"));
const AuthCallback = lazy(() => import("./pages/AuthCallback"));
const FAQ = lazy(() => import("./pages/FAQ"));
const FAQPublic = lazy(() => import("./pages/FAQPublic"));
const OpenClaw = lazy(() => import("./pages/OpenClaw"));
const Optimize = lazy(() => import("./pages/Optimize"));
const Playground = lazy(() => import("./pages/Playground"));
const Clusters = lazy(() => import("./pages/Clusters"));
const Compare = lazy(() => import("./pages/Compare"));
const Contact = lazy(() => import("./pages/Contact"));
const Calculator = lazy(() => import("./pages/Calculator"));
const Solutions = lazy(() => import("./pages/Solutions"));
const SolutionRouting = lazy(() => import("./pages/solutions/Routing"));
const SolutionFallback = lazy(() => import("./pages/solutions/Fallback"));
const SolutionAnalytics = lazy(() => import("./pages/solutions/SolutionAnalytics"));
const SolutionClustering = lazy(() => import("./pages/solutions/Clustering"));
const ProductHunt = lazy(() => import("./pages/ProductHunt"));
const Switch = lazy(() => import("./pages/Switch"));
const HeroAnnotatedPreview = lazy(() => import("./pages/HeroAnnotatedPreview"));
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

const ScrollToTop = () => {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (!hash) {
      window.scrollTo(0, 0);
      return;
    }
    // Hash deep-link (e.g. /terms#promotions): scroll to the anchor instead of
    // the top. Routes are lazy-loaded, so the target may not be in the DOM on
    // the first tick — poll briefly before giving up.
    const id = decodeURIComponent(hash.slice(1));
    let tries = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tryScroll = () => {
      const el = document.getElementById(id);
      if (el) {
        el.scrollIntoView({ block: "start" });
        return;
      }
      if (tries++ < 20) timer = setTimeout(tryScroll, 100);
    };
    tryScroll();
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [pathname, hash]);
  return null;
};

// Capture first-touch attribution (ref / utm_*) at app boot AND on client-side
// navigations that arrive carrying params (e.g. the Product Hunt page's
// /auth?ref=producthunt email link, which never triggers a full reload).
// captureAttributionFromUrl is first-touch and idempotent, so re-running it
// only ever stores the first attribution seen in the session.
const AttributionCapture = () => {
  const { pathname, search } = useLocation();
  useEffect(() => {
    import("@/utils/attribution").then(({ captureAttributionFromUrl }) => {
      captureAttributionFromUrl();
    });
  }, [pathname, search]);
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
          <ScrollToTop />
          <AttributionCapture />
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
            <Route path="/auth/callback" element={<AuthCallback />} />
            <Route path="/self-host" element={<OpenClaw />} />
            <Route path="/openclaw" element={<OpenClaw />} />
            <Route path="/optimize" element={<Optimize />} />
            <Route path="/switch" element={<Switch />} />
            <Route path="/hero-annotated" element={<HeroAnnotatedPreview />} />
            <Route path="/solutions" element={<Solutions />} />
            <Route path="/solutions/optimize" element={<Optimize />} />
            <Route path="/solutions/routing" element={<SolutionRouting />} />
            <Route path="/solutions/fallback" element={<SolutionFallback />} />
            <Route path="/solutions/analytics" element={<SolutionAnalytics />} />
            <Route path="/solutions/clustering" element={<SolutionClustering />} />
            <Route path="/compare" element={<Compare />} />
            <Route path="/compare/:competitor" element={<Compare />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="/faq" element={<FAQPublic />} />
            <Route path="/calculator" element={<Calculator />} />
            <Route path="/producthunt" element={<ProductHunt />} />

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
              <Route path="playground" element={<Playground />} />
              <Route path="clusters" element={<Clusters />} />
              <Route path="help" element={<FAQ />} />
              <Route path="onboarding" element={<Onboarding />} />
              <Route path="referrals" element={<Referrals />} />
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
