
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
import { useToast } from "@/hooks/use-toast";

// Lazy-loaded page components
const Homepage = lazy(() => import("./pages/Homepage"));
const BrandHome = lazy(() => import("./pages/BrandHome"));
const BrandHomeEditorial = lazy(() => import("./pages/BrandHomeEditorial"));
const RedesignBenchmarks = lazy(() => import("./pages/redesign/Benchmarks"));
const RedesignDocs = lazy(() => import("./pages/redesign/Docs"));
const RedesignSelfHosted = lazy(() => import("./pages/redesign/SelfHosted"));
const RedesignPricing = lazy(() => import("./pages/redesign/Pricing"));
const RedesignSolutions = lazy(() => import("./pages/redesign/Solutions"));
const RedesignBlog = lazy(() => import("./pages/redesign/Blog"));
const RedesignContact = lazy(() => import("./pages/redesign/Contact"));
const RedesignCalculator = lazy(() => import("./pages/redesign/Calculator"));
const RedesignFAQ = lazy(() => import("./pages/redesign/FAQ"));
const RedesignCompare = lazy(() => import("./pages/redesign/Compare"));
const RedesignSwitch = lazy(() => import("./pages/redesign/Switch"));
const RedesignProductHunt = lazy(() => import("./pages/redesign/ProductHunt"));
const RedesignSolutionDetail = lazy(() => import("./pages/redesign/Solutions").then(m => ({ default: m.SolutionDetail })));
const RedesignOptimize = lazy(() => import("./pages/redesign/Solutions").then(m => ({ default: m.OptimizeSolution })));
const PitchDeck = lazy(() => import("./pages/PitchDeck"));
const Tech = lazy(() => import("./pages/Tech"));
const Dashboard = lazy(() =>
  import("./components/Dashboard").then((m) => ({ default: m.Dashboard })),
);
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
            {/* New blueprint design is now the homepage; the previous homepage
                is preserved at /legacy so nothing is lost and it's reversible. */}
            <Route path="/" element={<BrandHome />} />
            <Route path="/legacy" element={<Homepage />} />
            <Route path="/redesign" element={<BrandHome />} />
            <Route path="/redesign/benchmarks" element={<RedesignBenchmarks />} />
            <Route path="/redesign/docs" element={<RedesignDocs />} />
            <Route path="/redesign/self-hosted" element={<RedesignSelfHosted />} />
            <Route path="/redesign/pricing" element={<RedesignPricing />} />
            <Route path="/redesign-editorial" element={<BrandHomeEditorial />} />
            <Route path="/pitch" element={<PitchDeck />} />
            <Route path="/tech" element={<Tech />} />
            <Route path="/pricing" element={<RedesignPricing />} />
            <Route path="/legacy/pricing" element={<Pricing />} />
            <Route path="/blog" element={<RedesignBlog />} />
            <Route path="/blog/:id" element={<BlogPost />} />
            <Route path="/legacy/blog" element={<Blog />} />
            <Route path="/docs/:section?" element={<RedesignDocs />} />
            <Route path="/legacy/docs/:section?" element={<Docs />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/auth/callback" element={<AuthCallback />} />
            <Route path="/self-host" element={<RedesignSelfHosted />} />
            <Route path="/openclaw" element={<RedesignSelfHosted />} />
            <Route path="/legacy/self-host" element={<OpenClaw />} />
            <Route path="/legacy/openclaw" element={<OpenClaw />} />
            <Route path="/optimize" element={<RedesignOptimize />} />
            <Route path="/legacy/optimize" element={<Optimize />} />
            <Route path="/switch" element={<RedesignSwitch />} />
            <Route path="/legacy/switch" element={<Switch />} />
            <Route path="/solutions" element={<RedesignSolutions />} />
            <Route path="/solutions/optimize" element={<RedesignOptimize />} />
            <Route path="/solutions/routing" element={<RedesignSolutionDetail />} />
            <Route path="/solutions/fallback" element={<RedesignSolutionDetail />} />
            <Route path="/solutions/analytics" element={<RedesignSolutionDetail />} />
            <Route path="/solutions/clustering" element={<RedesignSolutionDetail />} />
            {/* Old green-themed solution pages preserved under /legacy/* */}
            <Route path="/legacy/solutions" element={<Solutions />} />
            <Route path="/legacy/solutions/routing" element={<SolutionRouting />} />
            <Route path="/legacy/solutions/fallback" element={<SolutionFallback />} />
            <Route path="/legacy/solutions/analytics" element={<SolutionAnalytics />} />
            <Route path="/legacy/solutions/clustering" element={<SolutionClustering />} />
            <Route path="/compare" element={<RedesignCompare />} />
            <Route path="/compare/:competitor" element={<RedesignCompare />} />
            <Route path="/legacy/compare" element={<Compare />} />
            <Route path="/contact" element={<RedesignContact />} />
            <Route path="/legacy/contact" element={<Contact />} />
            <Route path="/faq" element={<RedesignFAQ />} />
            <Route path="/legacy/faq" element={<FAQPublic />} />
            <Route path="/calculator" element={<RedesignCalculator />} />
            <Route path="/legacy/calculator" element={<Calculator />} />
            <Route path="/producthunt" element={<RedesignProductHunt />} />
            <Route path="/legacy/producthunt" element={<ProductHunt />} />

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
