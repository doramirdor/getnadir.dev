import { useState, useEffect, useRef, type ButtonHTMLAttributes } from "react";
import {
  Key,
  Zap,
  Copy,
  Check,
  Loader2,
  CircleCheck,
  Gift,
  Mail,
  Monitor,
  CreditCard,
  ArrowRight,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useApiKey } from "@/hooks/useApiKey";
import { useAuth } from "@/hooks/useAuth";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  trackOnboardingStep,
  trackOnboardingComplete,
  trackApiKeyCreated,
  trackFirstCallResult,
  trackCheckoutStart,
} from "@/utils/analytics";
import CreateApiKeyDialog from "@/components/CreateApiKeyDialog";
import OnboardingCelebration from "@/components/OnboardingCelebration";
import { DailyQuotaBar } from "@/components/DailyQuotaBar";
import { getStoredAttribution } from "@/utils/attribution";
import { Sparkle, VerifierSeal, SketchRule } from "@/components/brand/motifs";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

async function sha256(message: string): Promise<string> {
  const data = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

type Mode = "byok" | "hosted";

/* ── Blueprint primitives (scoped to the .nadir-brand takeover) ───────── */

const FIELD =
  "w-full h-11 rounded-[2px] border border-[var(--line)] bg-[var(--paper)] px-3.5 text-[14px] text-[var(--ink)] " +
  "placeholder:text-[#a89e8b] outline-none transition-colors focus:border-[var(--ink)] focus:ring-2 focus:ring-[color:color-mix(in_srgb,var(--strawberry)_25%,transparent)]";

function InkButton({ className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className={`press inline-flex items-center justify-center gap-2 rounded-[2px] bg-[var(--ink)] px-5 py-3 text-[12px] font-semibold uppercase tracking-[0.11em] text-[var(--shell)] transition-colors hover:bg-[var(--ink-soft)] disabled:pointer-events-none disabled:opacity-60 ${className}`}
    />
  );
}

function OutlineButton({ className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className={`press inline-flex items-center justify-center gap-2 rounded-[2px] border border-[color:color-mix(in_srgb,var(--ink)_25%,transparent)] bg-[var(--paper)] px-5 py-3 text-[13px] font-medium text-[var(--ink)] transition-colors hover:border-[color:color-mix(in_srgb,var(--ink)_50%,transparent)] hover:bg-[var(--blush-soft)] disabled:pointer-events-none disabled:opacity-60 ${className}`}
    />
  );
}

// Two-step onboarding. Step 0 makes the user choose how they want to run:
// "Use our keys" (hosted, prepaid credits required to start, no provider keys
// needed) or "Bring your keys" (BYOK, paste a provider key, free monthly trial).
// Whichever they pick, we create a key with smart defaults, then they make
// their first call in the page and see real savings. The full configuration
// wizard (CreateApiKeyDialog) stays available behind the "Customize" link
// and on the API Keys page.
const STEPS = [
  { id: "api-key", label: "Your key", icon: Key },
  { id: "first-call", label: "First call", icon: Zap },
];

const NADIR_API_HOST = "api.getnadir.com";

// Smart defaults for the auto-created key: hosted (our keys), routing on
// across the Claude 4.6 family, fallback most-capable-first.
const DEFAULT_KEY_CONFIG = {
  name: "My first key",
  selected_models: ["claude-haiku-4-5", "claude-sonnet-4-6", "claude-opus-4-6"],
  benchmark_model: "claude-opus-4-6",
  model_parameters: {
    key_mode: "hosted" as Mode,
    layers: { routing: true, fallback: true, optimize: "off" },
    tier_models: {
      simple: "claude-haiku-4-5",
      medium: "claude-sonnet-4-6",
      complex: "claude-opus-4-6",
    },
    fallback_chain: ["claude-opus-4-6", "claude-sonnet-4-6", "claude-haiku-4-5"],
  },
};

// Per-provider routing defaults for the BYOK quick path. Mirrors the model
// catalog in CreateApiKeyDialog (which is module-private there). Simple =
// cheapest, complex = most capable, benchmark = complex.
const BYOK_DEFAULTS: Record<string, {
  selected_models: string[];
  benchmark_model: string;
  tier_models: { simple: string; medium?: string; complex: string };
}> = {
  anthropic: {
    selected_models: ["claude-haiku-4-5", "claude-sonnet-4-6", "claude-opus-4-6"],
    benchmark_model: "claude-opus-4-6",
    tier_models: { simple: "claude-haiku-4-5", medium: "claude-sonnet-4-6", complex: "claude-opus-4-6" },
  },
  openai: {
    selected_models: ["gpt-4o-mini", "gpt-5-mini", "gpt-5.4"],
    benchmark_model: "gpt-5.4",
    tier_models: { simple: "gpt-4o-mini", medium: "gpt-5-mini", complex: "gpt-5.4" },
  },
  google: {
    selected_models: ["gemini-2.0-flash", "gemini-2.5-pro"],
    benchmark_model: "gemini-2.5-pro",
    tier_models: { simple: "gemini-2.0-flash", complex: "gemini-2.5-pro" },
  },
  openrouter: {
    selected_models: ["openrouter/auto"],
    benchmark_model: "openrouter/auto",
    tier_models: { simple: "openrouter/auto", complex: "openrouter/auto" },
  },
  groq: {
    selected_models: ["groq/llama-3.3-70b-versatile", "groq/mixtral-8x7b-32768"],
    benchmark_model: "groq/llama-3.3-70b-versatile",
    tier_models: { simple: "groq/mixtral-8x7b-32768", complex: "groq/llama-3.3-70b-versatile" },
  },
};

const PROVIDER_FIELDS = [
  { key: "anthropic", label: "Anthropic", placeholder: "sk-ant-..." },
  { key: "openai", label: "OpenAI", placeholder: "sk-..." },
  { key: "google", label: "Google AI", placeholder: "AI..." },
  { key: "openrouter", label: "OpenRouter", placeholder: "sk-or-..." },
  { key: "groq", label: "Groq", placeholder: "gsk_..." },
];

// Replicates isProviderKeyFormatValid() from CreateApiKeyDialog.tsx. Note
// google has no prefix check (length only), matching the dialog's behavior.
function isProviderKeyFormatValid(provider: string, key: string): boolean {
  if (!key.trim()) return false;
  switch (provider) {
    case "openai": return key.startsWith("sk-") && key.length > 20;
    case "anthropic": return key.startsWith("sk-ant-") && key.length > 20;
    case "openrouter": return key.startsWith("sk-or-") && key.length > 20;
    case "groq": return key.startsWith("gsk_") && key.length > 20;
    default: return key.length > 10;
  }
}

interface TestResult {
  ok: boolean;
  message?: string;
  model?: string;
  latencyMs?: number;
  content?: string;
  costUsd?: number | null;
  benchmarkModel?: string | null;
  benchmarkCostUsd?: number | null;
  savingsPct?: number | null;
}

const Onboarding = () => {
  const [currentStep, setCurrentStep] = useState(0);
  const [mode, setMode] = useState<Mode>("hosted");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createdApiKey, setCreatedApiKey] = useState<string | null>(null);
  const [existingKeyPrefix, setExistingKeyPrefix] = useState<string | null>(null);
  const [creatingKey, setCreatingKey] = useState(false);
  const [bootstrapLoading, setBootstrapLoading] = useState(true);
  const [chooserMode, setChooserMode] = useState<Mode | null>(null);
  const [byokProvider, setByokProvider] = useState("anthropic");
  const [byokKey, setByokKey] = useState("");
  const [copied, setCopied] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [subscribing, setSubscribing] = useState(false);
  const [billingActive, setBillingActive] = useState(false);
  const [snippetLang, setSnippetLang] = useState("python");
  const onboardingFocusedRef = useRef(false);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { setApiKey: setSessionApiKey } = useApiKey();
  const { user } = useAuth();
  const isMobile = useIsMobile();

  const campaignLimits: Record<string, number> = {};
  const storedRef = getStoredAttribution().ref;
  const freeLimit = (storedRef && campaignLimits[storedRef]) || 5;
  const hasKey = !!createdApiKey || !!existingKeyPrefix;

  // Insert an api_keys row and return the plaintext key. Shared by the
  // auto-create path and the CreateApiKeyDialog onCreate handler.
  const insertApiKey = async (config: {
    name: string;
    selected_models: string[];
    benchmark_model: string;
    model_parameters: Record<string, any>;
  }): Promise<string> => {
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();
    if (!authUser) throw new Error("Not authenticated");

    const keyValue = `ndr_${crypto.randomUUID().replace(/-/g, "").slice(0, 32)}`;
    const keyHash = await sha256(keyValue);

    const { error } = await supabase.from("api_keys").insert({
      user_id: authUser.id,
      name: config.name,
      key_hash: keyHash,
      prefix: keyValue.slice(0, 8),
      is_active: true,
      selected_models: config.selected_models,
      benchmark_model: config.benchmark_model,
      model_parameters: config.model_parameters,
    });

    if (error) throw error;
    return keyValue;
  };

  // Called by CreateApiKeyDialog (the "Customize" path) with the full
  // configured key payload. The dialog has already saved any new BYOK
  // provider keys via JWT.
  const handleCreateApiKey = async (config: {
    name: string;
    selected_models: string[];
    benchmark_model: string;
    model_parameters: Record<string, any>;
  }) => {
    const keyValue = await insertApiKey(config);
    setMode((config.model_parameters?.key_mode as Mode) || "byok");
    setCreatedApiKey(keyValue);
    setSessionApiKey(keyValue);
    setTestResult(null);
    trackApiKeyCreated("onboarding");
    toast({
      title: "API Key Created",
      description: "Your key is configured and ready to use.",
    });
  };

  // Auto-create (or explicitly re-create) the default key.
  const createDefaultKey = async () => {
    setCreatingKey(true);
    try {
      const keyValue = await insertApiKey(DEFAULT_KEY_CONFIG);
      setMode("hosted");
      setCreatedApiKey(keyValue);
      setSessionApiKey(keyValue);
      setExistingKeyPrefix(null);
      setTestResult(null);
      trackApiKeyCreated("onboarding", false);
    } catch (e: any) {
      toast({
        variant: "destructive",
        title: "Couldn't create your key",
        description: e.message || "Please try again.",
      });
    } finally {
      setCreatingKey(false);
    }
  };

  // BYOK quick path: save the provider key (encrypted server-side via JWT),
  // then create a key_mode:"byok" key with routing defaults for that provider.
  const handleCreateByokKey = async () => {
    if (!isProviderKeyFormatValid(byokProvider, byokKey)) return;
    setCreatingKey(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Not authenticated");

      // 1) Persist the BYOK provider key (Fernet-encrypted server-side).
      const resp = await fetch(`${API_BASE}/v1/provider-keys/setup`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ provider: byokProvider, api_key: byokKey.trim() }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.detail || "Couldn't save your provider key.");
      }

      // 2) Create the api_keys row in byok mode.
      const d = BYOK_DEFAULTS[byokProvider] || BYOK_DEFAULTS.anthropic;
      const routingEnabled = d.selected_models.length > 1;
      const keyValue = await insertApiKey({
        name: "My first key",
        selected_models: d.selected_models,
        benchmark_model: d.benchmark_model,
        model_parameters: {
          key_mode: "byok",
          layers: { routing: routingEnabled, fallback: true, optimize: "off" },
          ...(routingEnabled ? { tier_models: d.tier_models } : {}),
          fallback_chain: [...d.selected_models].reverse(),
        },
      });

      setMode("byok");
      setCreatedApiKey(keyValue);
      setSessionApiKey(keyValue);
      setExistingKeyPrefix(null);
      setTestResult(null);
      trackApiKeyCreated("onboarding", false);
    } catch (e: any) {
      toast({
        variant: "destructive",
        title: "Couldn't create your key",
        description: e.message || "Please try again.",
      });
    } finally {
      setCreatingKey(false);
    }
  };

  // Bootstrap: read-only. We no longer auto-create a key — the user picks a
  // mode in the chooser first. If they already have a key (revisit), we can't
  // show the plaintext again, so we offer to set up a new one or continue.
  useEffect(() => {
    if (!user?.id || createdApiKey) { setBootstrapLoading(false); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("api_keys")
        .select("id, prefix")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .limit(1);
      if (cancelled) return;
      if (data && data.length > 0) setExistingKeyPrefix(data[0].prefix);
      setBootstrapLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  // Seed billing-active from the DB (like BillingNudge/DailyQuotaBar/Billing do)
  // so an already-paid user who re-enters onboarding (deep link, email-continue
  // link, or the zero-key redirect) is NOT shown the "first-time +$2" offer
  // again. Only ever flips billingActive true, so it never clobbers the
  // return-from-Stripe URL-param path.
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("user_subscriptions")
        .select("status")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!cancelled && data?.status === "active") setBillingActive(true);
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Real first call: hits /v1/chat/completions with the new key (model auto),
  // then surfaces the routed model, latency, cost, and savings from
  // nadir_metadata. This is the activation moment, so it's tracked.
  const handleTestRequest = async () => {
    if (!createdApiKey) return;
    setTesting(true);
    setTestResult(null);
    const started = performance.now();
    try {
      const res = await fetch(`${API_BASE}/v1/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": createdApiKey,
        },
        body: JSON.stringify({
          model: "auto",
          messages: [{ role: "user", content: "Say hello in one short sentence." }],
          max_tokens: 60,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        const detail = data?.detail;
        throw new Error(
          typeof detail === "string" ? detail : detail?.message || "Request failed",
        );
      }
      const clientLatency = Math.round(performance.now() - started);
      const meta = data.nadir_metadata || {};
      const bench = meta.benchmark_comparison || null;
      const costUsd = meta.cost?.total_cost_usd ?? bench?.routed_cost_usd ?? null;
      let savingsPct: number | null = null;
      if (bench?.benchmark_cost_usd > 0 && bench?.savings_usd != null) {
        savingsPct = Math.round((bench.savings_usd / bench.benchmark_cost_usd) * 100);
      }
      const result: TestResult = {
        ok: true,
        model: data.model,
        latencyMs: meta.response_time_ms || clientLatency,
        content: data.choices?.[0]?.message?.content || "",
        costUsd,
        benchmarkModel: bench?.benchmark_model ?? null,
        benchmarkCostUsd: bench?.benchmark_cost_usd ?? null,
        savingsPct,
      };
      setTestResult(result);
      trackFirstCallResult("success", {
        model: result.model,
        latency_ms: result.latencyMs,
        savings_pct: savingsPct,
      });
    } catch (e: any) {
      setTestResult({ ok: false, message: e.message || "Request failed" });
      trackFirstCallResult("error", { message: e.message });
    } finally {
      setTesting(false);
    }
  };

  const handleSubscribe = async (source: string = "onboarding_offer") => {
    setSubscribing(true);
    // Attribute which surface drove the top-up so the funnel is measurable.
    trackCheckoutStart("credit_topup_5", typeof source === "string" ? source : "onboarding_offer");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Not authenticated");

      // Use Supabase JWT to call billing, no API key needed yet. This is a $5
      // prepaid-credit purchase (no subscription); the first top-up lands as $7
      // of credit and puts a card on file so we can bill the savings fee.
      const res = await fetch(`${API_BASE}/v1/billing/credits/checkout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          amount_usd: 5,
          success_url: `${window.location.origin}/dashboard/onboarding?credit=added`,
          // If Stripe cancels, return to the first-call step where the
          // billing card lives.
          cancel_url: `${window.location.origin}/dashboard/onboarding?step=1`,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Checkout failed");
      if (!data.checkout_url) throw new Error("Checkout failed");

      // Redirect to Stripe checkout
      window.location.href = data.checkout_url;
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e.message });
    } finally {
      setSubscribing(false);
    }
  };

  // Handle return from Stripe checkout + deep links
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    let landingStep = 0;
    if (params.get("credit") === "added") {
      setBillingActive(true);
      landingStep = 1;
      toast({ title: "Credit added", description: "$5 added, you got $7 of credit. Billing is active and routing is unlocked." });
      window.history.replaceState({}, "", "/dashboard/onboarding");
    }
    // Came back from the in-dialog Pro upgrade (user picked Hosted mid-wizard).
    // Re-open the create dialog so they can finish.
    if (params.get("upgraded") === "true") {
      setBillingActive(true);
      setCreateDialogOpen(true);
      toast({ title: "Pro trial active", description: "Finish creating your Hosted API key." });
      window.history.replaceState({}, "", "/dashboard/onboarding");
    }
    const stepParam = params.get("step");
    if (stepParam) {
      landingStep = parseInt(stepParam, 10) || 0;
      window.history.replaceState({}, "", "/dashboard/onboarding");
    }
    setCurrentStep(landingStep);
    // Fire on view (not just on transition) so the funnel sees everyone who
    // lands here, including bounce-without-clicking users.
    trackOnboardingStep(landingStep, STEPS[landingStep]?.id || "api-key");
  }, []);

  const goToStep = (next: number) => {
    setCurrentStep(next);
    trackOnboardingStep(next, STEPS[next].id);
  };

  const handleFinish = () => {
    trackOnboardingComplete(mode);
    setShowCelebration(true);
  };

  const handleSkip = () => {
    if (user) {
      localStorage.setItem(`nadir_onboarding_skipped:${user.id}`, "1");
    }
    navigate("/dashboard");
    toast({
      title: "Onboarding skipped",
      description: "You can configure your API key anytime from the API Keys page.",
    });
  };

  const [emailSending, setEmailSending] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  const handleEmailContinueLink = async () => {
    if (!user?.email) {
      toast({
        variant: "destructive",
        title: "No email on file",
        description: "We couldn't find an email on your account.",
      });
      return;
    }
    setEmailSending(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Not authenticated");

      const continueUrl = `${window.location.origin}/dashboard/onboarding?step=${currentStep}`;
      const res = await fetch(`${API_BASE}/v1/email/onboarding-continue-link`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ continue_url: continueUrl }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || "Failed to send email");
      }
      setEmailSent(true);
      toast({
        title: "Email sent",
        description: `We sent a continue link to ${user.email}. Open it on your computer.`,
      });
    } catch (e: any) {
      toast({
        variant: "destructive",
        title: "Couldn't send email",
        description: e.message || "Please try again later.",
      });
    } finally {
      setEmailSending(false);
    }
  };

  const handleCelebrationContinue = () => {
    navigate("/dashboard");
    toast({ title: "Welcome to Nadir!", description: "Your setup is complete." });
  };

  const getSnippet = (lang: string) => {
    const key = createdApiKey || "<YOUR_NADIR_API_KEY>";
    if (lang === "python") {
      return `import openai

client = openai.OpenAI(
    base_url="https://${NADIR_API_HOST}/v1",
    api_key="${key}",
)

response = client.chat.completions.create(
    model="auto",  # Nadir picks the best model
    messages=[{"role": "user", "content": "Hello!"}],
)
print(response.choices[0].message.content)`;
    }
    if (lang === "node") {
      return `import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "https://${NADIR_API_HOST}/v1",
  apiKey: "${key}",
});

const response = await client.chat.completions.create({
  model: "auto", // Nadir picks the best model
  messages: [{ role: "user", content: "Hello!" }],
});
console.log(response.choices[0].message.content);`;
    }
    return `curl https://${NADIR_API_HOST}/v1/chat/completions \\
  -H "Authorization: Bearer ${key}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "auto",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'`;
  };

  // Celebration takeover — the editorial "Nice job!" end-of-onboarding moment.
  // If the user finished without adding credit, the celebration re-offers the
  // $5 (→$7) top-up as a last, well-timed nudge (skip-recovery).
  if (showCelebration) {
    return (
      <OnboardingCelebration
        result={testResult}
        freeLimit={freeLimit}
        billingActive={billingActive}
        subscribing={subscribing}
        onAddCredit={() => handleSubscribe("onboarding_celebration")}
        onContinue={handleCelebrationContinue}
      />
    );
  }

  const savedPct =
    testResult?.ok && testResult.savingsPct && testResult.savingsPct > 0
      ? testResult.savingsPct
      : null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Nadir onboarding"
      ref={(el) => { if (el && !onboardingFocusedRef.current) { onboardingFocusedRef.current = true; el.focus(); } }}
      tabIndex={-1}
      className="nadir-brand grain fixed inset-0 z-[55] overflow-y-auto bg-[var(--shell)] outline-none"
    >
      {/* Decorative sketch marks */}
      <div aria-hidden className="pointer-events-none absolute inset-0 z-0">
        <Sparkle className="twinkle absolute left-[12%] top-[16%] hidden h-4 w-4 opacity-50 lg:block" color="var(--strawberry)" />
        <Sparkle className="twinkle absolute right-[14%] top-[24%] hidden h-4 w-4 opacity-45 lg:block" color="var(--sky)" />
      </div>

      <div className="relative z-10 mx-auto flex min-h-full w-full max-w-2xl flex-col px-5 py-8 sm:px-6 sm:py-10">
        {/* Top bar */}
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5">
            <span className="font-editorial text-[22px] leading-none tracking-[-0.01em] text-[var(--ink)]">Nadir</span>
            <Sparkle className="h-3.5 w-3.5" color="var(--strawberry)" />
          </span>
          <button
            onClick={handleSkip}
            className="font-mono text-[11px] uppercase tracking-[0.14em] text-[color:color-mix(in_srgb,var(--ink)_70%,transparent)] transition-colors hover:text-[var(--ink)]"
          >
            Skip for now
          </button>
        </div>

        {/* Stepper */}
        <div className="mt-8 flex items-center gap-3">
          {STEPS.map((step, i) => (
            <div key={step.id} className="flex flex-1 items-center gap-3" aria-current={i === currentStep ? "step" : undefined}>
              <div className="flex items-center gap-2">
                <span
                  className={`grid h-7 w-7 place-items-center rounded-full border text-[12px] font-semibold transition-colors ${
                    i < currentStep
                      ? "border-[var(--ink)] bg-[var(--ink)] text-[var(--shell)]"
                      : i === currentStep
                        ? "border-[var(--strawberry)] bg-[var(--strawberry)] text-[var(--shell)] pulse-ring"
                        : "border-[var(--line)] bg-[var(--paper)] text-[color:color-mix(in_srgb,var(--ink)_40%,transparent)]"
                  }`}
                >
                  {i < currentStep ? <Check className="h-3.5 w-3.5" /> : i + 1}
                </span>
                <span className={`eyebrow ${i <= currentStep ? "text-[color:color-mix(in_srgb,var(--ink)_70%,transparent)]" : "text-[color:color-mix(in_srgb,var(--ink)_35%,transparent)]"}`}>{step.label}</span>
              </div>
              {i < STEPS.length - 1 && (
                <span className="h-px flex-1 bg-[var(--line)]" />
              )}
            </div>
          ))}
        </div>

        {/* Hero header */}
        <div className="mt-8">
          {currentStep === 0 ? (
            <>
              <h1 className="font-editorial text-[clamp(30px,5vw,44px)] font-semibold leading-[1.0] text-[var(--ink)]">
                Route your{" "}
                <span className="whitespace-nowrap">
                  <span className="italic text-[var(--strawberry)]">first call.</span>
                  <Sparkle className="twinkle inline-block h-4 w-4 align-super" color="var(--strawberry)" />
                </span>
              </h1>
              <p className="mt-3 max-w-lg text-[15px] leading-relaxed text-[color:color-mix(in_srgb,var(--ink)_70%,transparent)]">
                Pick how you want to run. In under two minutes you'll send a real request
                and see exactly what Nadir saved you.
              </p>
            </>
          ) : (
            <>
              <h1 className="font-editorial text-[clamp(30px,5vw,44px)] font-semibold leading-[1.0] text-[var(--ink)]">
                Send one request.{" "}
                <span className="whitespace-nowrap">
                  <span className="italic text-[var(--strawberry)]">See the receipt.</span>
                  <Sparkle className="twinkle inline-block h-4 w-4 align-super" color="var(--strawberry)" />
                </span>
              </h1>
              <p className="mt-3 max-w-lg text-[15px] leading-relaxed text-[color:color-mix(in_srgb,var(--ink)_70%,transparent)]">
                Watch Nadir route a real call to the model that fits, then keep the savings going.
              </p>
            </>
          )}
        </div>

        {/* Value primer strip */}
        <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2">
          {[
            ["60%", "lower cost"],
            ["98%", "quality kept"],
            ["$0", "base fee"],
          ].map(([v, k]) => (
            <div key={k} className="flex items-baseline gap-1.5">
              <span className="font-editorial text-[20px] leading-none text-[var(--terracotta)]">{v}</span>
              <span className="eyebrow text-[color:color-mix(in_srgb,var(--ink)_55%,transparent)]">{k}</span>
            </div>
          ))}
        </div>

        {/* Step content card */}
        <div className="relative mt-6 rounded-[3px] border border-[color:color-mix(in_srgb,var(--ink)_15%,transparent)] bg-[var(--paper)] p-5 shadow-[0_16px_40px_-24px_rgba(21,35,59,0.4)] sm:p-6">
          {/* ═══ STEP 0: Choose how you want to run, then reveal the key ═══ */}
          {currentStep === 0 && (
            <div className="space-y-5">
              {bootstrapLoading ? (
                <div className="flex flex-col items-center justify-center gap-3 py-10">
                  <Loader2 className="h-6 w-6 animate-spin text-[var(--terracotta)]" />
                  <p className="text-[13px] text-[color:color-mix(in_srgb,var(--ink)_55%,transparent)]">Loading your account...</p>
                </div>
              ) : creatingKey ? (
                <div className="flex flex-col items-center justify-center gap-3 py-10">
                  <Loader2 className="h-6 w-6 animate-spin text-[var(--terracotta)]" />
                  <p className="text-[13px] text-[color:color-mix(in_srgb,var(--ink)_55%,transparent)]">Setting up your key...</p>
                </div>
              ) : createdApiKey ? (
                <>
                  <div className="flex items-center gap-2">
                    <Key className="h-5 w-5 text-[var(--terracotta)]" />
                    <h2 className="font-editorial text-[22px] text-[var(--ink)]">Your API key is ready</h2>
                  </div>
                  {mode === "hosted" ? (
                    <p className="text-[13.5px] text-[color:color-mix(in_srgb,var(--ink)_65%,transparent)]">
                      Routing on our keys. Add prepaid credits to make your first call,
                      billed at AWS cost + 20%.
                    </p>
                  ) : (
                    <p className="text-[13.5px] text-[color:color-mix(in_srgb,var(--ink)_65%,transparent)]">
                      Routing on your own provider keys. You pay your provider directly. Nadir
                      charges a savings fee only.
                    </p>
                  )}

                  <div className="rounded-[2px] border border-[color:color-mix(in_srgb,var(--ink)_20%,transparent)] bg-[var(--shell)] p-4">
                    <p className="mb-2 eyebrow text-[var(--terracotta)]">Copy it now, it won't be shown again</p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 break-all rounded-[2px] border border-[var(--line)] bg-[var(--paper)] p-2 font-mono text-[12.5px] text-[var(--ink)]">
                        {createdApiKey}
                      </code>
                      <OutlineButton className="px-3 py-2" aria-label={copied ? "Copied" : "Copy API key"} onClick={() => handleCopy(createdApiKey)}>
                        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      </OutlineButton>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {(mode === "hosted"
                      ? [
                          "Smart routing on: simple prompts go to Haiku, hard ones to Opus",
                          "Fallback chain enabled, failed requests retry automatically",
                          "Prepaid credits on our keys, billed at AWS cost + 20%",
                        ]
                      : [
                          "Smart routing on across your provider's models",
                          "Fallback chain enabled, failed requests retry automatically",
                          "You pay your provider directly. Nadir's fee is 25% of what we save you, 10% above $2K a month.",
                        ]
                    ).map((item) => (
                      <div key={item} className="flex items-start gap-2 text-[13px] text-[color:color-mix(in_srgb,var(--ink)_70%,transparent)]">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-[var(--terracotta)]" />
                        <span>{item}</span>
                      </div>
                    ))}
                  </div>

                  {mode === "hosted" && (
                    <div className="space-y-2 rounded-[2px] border border-[color:color-mix(in_srgb,var(--terracotta)_25%,transparent)] bg-[color:color-mix(in_srgb,var(--terracotta)_6%,transparent)] p-3">
                      <p className="text-[12px] text-[color:color-mix(in_srgb,var(--ink)_70%,transparent)]">
                        Hosted keys need a prepaid balance before your first call.
                        Add credits now, or switch to your own provider keys (BYOK)
                        to route for free.
                      </p>
                      <OutlineButton className="w-full" onClick={() => handleSubscribe("onboarding_hosted_addcredits")} disabled={subscribing}>
                        {subscribing ? (
                          <><Loader2 className="h-4 w-4 animate-spin" /> Redirecting...</>
                        ) : (
                          <><CreditCard className="h-4 w-4" /> Add $5 credit, get $7</>
                        )}
                      </OutlineButton>
                    </div>
                  )}

                  <InkButton className="w-full" onClick={() => goToStep(1)}>
                    Continue to your first call <ArrowRight className="h-3.5 w-3.5" />
                  </InkButton>

                  <div className="flex justify-center">
                    <button
                      onClick={() => setCreateDialogOpen(true)}
                      className="text-[12px] text-[color:color-mix(in_srgb,var(--ink)_50%,transparent)] underline-offset-2 transition-colors hover:text-[var(--ink)] hover:underline"
                    >
                      Customize routing and providers instead
                    </button>
                  </div>
                </>
              ) : existingKeyPrefix ? (
                <>
                  <div className="flex items-center gap-2">
                    <Key className="h-5 w-5 text-[var(--terracotta)]" />
                    <h2 className="font-editorial text-[22px] text-[var(--ink)]">You already have an API key</h2>
                  </div>
                  <p className="text-[13.5px] text-[color:color-mix(in_srgb,var(--ink)_65%,transparent)]">
                    Your key starting with <code className="rounded-[2px] bg-[var(--shell-deep)] px-1 py-0.5 font-mono text-[12px]">{existingKeyPrefix}...</code> is
                    active. For security we can't show it again. You can set up a new key or
                    continue with the one you have.
                  </p>
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <InkButton onClick={() => setExistingKeyPrefix(null)} disabled={creatingKey}>
                      <Key className="h-4 w-4" /> Set up a new key
                    </InkButton>
                    <OutlineButton onClick={() => goToStep(1)}>
                      Continue with my existing key
                    </OutlineButton>
                  </div>
                </>
              ) : (
                /* ═══ CHOOSER: explicit BYOK vs Hosted ═══ */
                <div className="space-y-5">
                  <div className="space-y-1">
                    <h2 className="font-editorial text-[22px] text-[var(--ink)]">Choose how you want to run Nadir</h2>
                    <p className="text-[13.5px] text-[color:color-mix(in_srgb,var(--ink)_65%,transparent)]">
                      Bring your own keys (BYOK) or use ours. You pay only on what we save you.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {/* Use our keys (hosted) */}
                    <button
                      type="button"
                      onClick={() => setChooserMode("hosted")}
                      className={`relative rounded-[2px] border p-4 text-left transition-all ${
                        chooserMode === "hosted"
                          ? "border-[var(--ink)] bg-[var(--paper)] shadow-[0_12px_30px_-18px_rgba(21,35,59,0.55)]"
                          : "border-[var(--line)] bg-[color:color-mix(in_srgb,var(--paper)_60%,transparent)] hover:border-[color:color-mix(in_srgb,var(--ink)_40%,transparent)]"
                      }`}
                    >
                      {chooserMode === "hosted" && (
                        <span className="absolute right-3 top-3 h-2 w-2 rounded-full bg-[var(--strawberry)]" />
                      )}
                      <div className="mb-1.5 flex items-center gap-2">
                        <Zap className={`h-4 w-4 ${chooserMode === "hosted" ? "text-[var(--terracotta)]" : "text-[color:color-mix(in_srgb,var(--ink)_45%,transparent)]"}`} />
                        <span className="text-[14px] font-semibold text-[var(--ink)]">Use our keys</span>
                      </div>
                      <p className="mb-3 text-[12px] text-[color:color-mix(in_srgb,var(--ink)_60%,transparent)]">
                        We run the keys, nothing to set up. Add prepaid credits to start, then pay only on what we save you.
                      </p>
                      <div className="space-y-1.5">
                        {[
                          "Prepaid credits, billed at AWS cost + 20%",
                          "No provider keys to manage",
                          "Powered by Claude on AWS Bedrock",
                        ].map((b) => (
                          <div key={b} className="flex items-start gap-1.5 text-[12px] text-[color:color-mix(in_srgb,var(--ink)_60%,transparent)]">
                            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--terracotta)]" />
                            <span>{b}</span>
                          </div>
                        ))}
                      </div>
                    </button>

                    {/* Bring your keys (BYOK) */}
                    <button
                      type="button"
                      onClick={() => setChooserMode("byok")}
                      className={`relative rounded-[2px] border p-4 text-left transition-all ${
                        chooserMode === "byok"
                          ? "border-[var(--ink)] bg-[var(--paper)] shadow-[0_12px_30px_-18px_rgba(21,35,59,0.55)]"
                          : "border-[var(--line)] bg-[color:color-mix(in_srgb,var(--paper)_60%,transparent)] hover:border-[color:color-mix(in_srgb,var(--ink)_40%,transparent)]"
                      }`}
                    >
                      {chooserMode === "byok" && (
                        <span className="absolute right-3 top-3 h-2 w-2 rounded-full bg-[var(--strawberry)]" />
                      )}
                      <div className="mb-1.5 flex items-center gap-2">
                        <Key className={`h-4 w-4 ${chooserMode === "byok" ? "text-[var(--terracotta)]" : "text-[color:color-mix(in_srgb,var(--ink)_45%,transparent)]"}`} />
                        <span className="text-[14px] font-semibold text-[var(--ink)]">Bring your keys</span>
                      </div>
                      <p className="mb-3 text-[12px] text-[color:color-mix(in_srgb,var(--ink)_60%,transparent)]">
                        Use your own provider keys. You pay providers directly at your rate.
                      </p>
                      <div className="space-y-1.5">
                        {[
                          "No usage markup, Nadir adds nothing per call",
                          "A savings fee only: 25% of the first $2K saved a month, 10% above",
                          "No base fee. If we save you nothing, you pay nothing.",
                        ].map((b) => (
                          <div key={b} className="flex items-start gap-1.5 text-[12px] text-[color:color-mix(in_srgb,var(--ink)_60%,transparent)]">
                            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--terracotta)]" />
                            <span>{b}</span>
                          </div>
                        ))}
                      </div>
                    </button>
                  </div>

                  {/* BYOK inline provider entry */}
                  {chooserMode === "byok" && (
                    <div className="space-y-3 rounded-[2px] border border-[var(--line)] bg-[var(--shell)] p-4">
                      <span className="eyebrow text-[color:color-mix(in_srgb,var(--ink)_55%,transparent)]">Add a provider key to start</span>
                      <div className="flex flex-wrap gap-2">
                        {PROVIDER_FIELDS.map((p) => (
                          <button
                            key={p.key}
                            type="button"
                            aria-pressed={byokProvider === p.key}
                            onClick={() => { setByokProvider(p.key); setByokKey(""); }}
                            className={`rounded-[2px] border px-2.5 py-1 text-[12px] transition-all ${
                              byokProvider === p.key
                                ? "border-[var(--ink)] bg-[var(--ink)] font-medium text-[var(--shell)]"
                                : "border-[var(--line)] bg-[var(--paper)] text-[color:color-mix(in_srgb,var(--ink)_60%,transparent)] hover:border-[color:color-mix(in_srgb,var(--ink)_40%,transparent)]"
                            }`}
                          >
                            {p.label}
                          </button>
                        ))}
                      </div>
                      <input
                        type="password"
                        autoComplete="off"
                        aria-label={`${PROVIDER_FIELDS.find((p) => p.key === byokProvider)?.label} API key`}
                        aria-invalid={!!byokKey && !isProviderKeyFormatValid(byokProvider, byokKey)}
                        aria-describedby="byok-key-error"
                        placeholder={PROVIDER_FIELDS.find((p) => p.key === byokProvider)?.placeholder}
                        value={byokKey}
                        onChange={(e) => setByokKey(e.target.value)}
                        className={FIELD}
                      />
                      {byokKey && !isProviderKeyFormatValid(byokProvider, byokKey) && (
                        <p id="byok-key-error" role="alert" className="text-[12px] text-[var(--terracotta-d)]">
                          That doesn't look like a {PROVIDER_FIELDS.find((p) => p.key === byokProvider)?.label} key.
                        </p>
                      )}
                      <p className="text-[12px] text-[color:color-mix(in_srgb,var(--ink)_55%,transparent)]">
                        Your key is encrypted and used only to route your requests. You can add more providers later.
                      </p>
                    </div>
                  )}

                  {/* Primary CTA depends on the choice */}
                  {chooserMode === "hosted" && (
                    <InkButton className="w-full" onClick={createDefaultKey} disabled={creatingKey}>
                      Start free with our keys <ArrowRight className="h-3.5 w-3.5" />
                    </InkButton>
                  )}
                  {chooserMode === "byok" && (
                    <InkButton
                      className="w-full"
                      onClick={handleCreateByokKey}
                      disabled={creatingKey || !isProviderKeyFormatValid(byokProvider, byokKey)}
                    >
                      Save key and continue <ArrowRight className="h-3.5 w-3.5" />
                    </InkButton>
                  )}

                  <div className="flex justify-center">
                    <button
                      onClick={() => setCreateDialogOpen(true)}
                      className="text-[12px] text-[color:color-mix(in_srgb,var(--ink)_50%,transparent)] underline-offset-2 transition-colors hover:text-[var(--ink)] hover:underline"
                    >
                      Customize routing and providers instead
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ═══ STEP 1: First call (test in-page, see savings, then billing) ═══ */}
          {currentStep === 1 && (
            <div className="space-y-4">
              <h2 className="font-editorial text-[22px] text-[var(--ink)]">Make your first call</h2>
              <p className="text-[13.5px] text-[color:color-mix(in_srgb,var(--ink)_65%,transparent)]">
                Paste this into your code, or send a test request right here.
              </p>

              <div className="space-y-2">
                <span className="eyebrow text-[color:color-mix(in_srgb,var(--ink)_55%,transparent)]">Integration snippet</span>
                <div className="flex gap-1.5">
                  {[["python", "Python"], ["node", "Node.js"], ["curl", "cURL"]].map(([val, lbl]) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setSnippetLang(val)}
                      className={`rounded-[2px] px-3 py-1.5 text-[12px] font-medium transition-colors ${
                        snippetLang === val
                          ? "bg-[var(--ink)] text-[var(--shell)]"
                          : "bg-[var(--shell-deep)] text-[color:color-mix(in_srgb,var(--ink)_60%,transparent)] hover:text-[var(--ink)]"
                      }`}
                    >
                      {lbl}
                    </button>
                  ))}
                </div>
                <div className="relative">
                  <pre className="overflow-x-auto rounded-[2px] border border-[color:color-mix(in_srgb,var(--ink)_15%,transparent)] bg-[var(--ink)] p-4 font-mono text-[12px] leading-relaxed text-[var(--shell)]">
                    {getSnippet(snippetLang)}
                  </pre>
                  <button
                    type="button"
                    aria-label="Copy code snippet"
                    className="absolute right-2 top-2 rounded-[2px] p-1.5 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
                    onClick={() => handleCopy(getSnippet(snippetLang))}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                </div>
                <p className="text-[12px] text-[color:color-mix(in_srgb,var(--ink)_55%,transparent)]">
                  Works with any OpenAI-compatible SDK. Just change the base URL to https://{NADIR_API_HOST}/v1.
                </p>
              </div>

              {createdApiKey ? (
                <OutlineButton onClick={handleTestRequest} disabled={testing} className="w-full">
                  {testing ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Routing your request...</>
                  ) : (
                    <><Zap className="h-4 w-4" /> Send a test request from here</>
                  )}
                </OutlineButton>
              ) : (
                <p className="text-[12px] text-[color:color-mix(in_srgb,var(--ink)_55%,transparent)]">
                  We can only send a test from here for a key created in this session. Use the
                  snippet above with your existing key, then check the dashboard for the request.
                </p>
              )}

              {/* Test-call receipt — the proof */}
              {testResult && testResult.ok && (
                <div role="status" aria-live="polite" className="relative rounded-[2px] border border-[color:color-mix(in_srgb,var(--ink)_20%,transparent)] bg-[var(--paper)] p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="eyebrow text-[color:color-mix(in_srgb,var(--ink)_55%,transparent)]">Routing receipt</span>
                    <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-[var(--ink)]">
                      <CircleCheck className="h-3.5 w-3.5 text-[var(--sage)]" /> 200 OK
                    </span>
                  </div>
                  {testResult.content && (
                    <p className="mb-3 font-hand text-[18px] leading-snug text-[var(--ink)]">"{testResult.content}"</p>
                  )}
                  <dl className="space-y-1.5 border-t border-dashed border-[color:color-mix(in_srgb,var(--ink)_15%,transparent)] pt-2.5">
                    <div className="flex items-baseline justify-between">
                      <dt className="font-mono text-[10px] uppercase tracking-wider text-[color:color-mix(in_srgb,var(--ink)_50%,transparent)]">Model</dt>
                      <dd className="font-mono text-[12px] text-[var(--ink)]">{testResult.model}</dd>
                    </div>
                    {testResult.latencyMs ? (
                      <div className="flex items-baseline justify-between">
                        <dt className="font-mono text-[10px] uppercase tracking-wider text-[color:color-mix(in_srgb,var(--ink)_50%,transparent)]">Latency</dt>
                        <dd className="font-mono text-[12px] text-[var(--ink)]">{testResult.latencyMs} ms</dd>
                      </div>
                    ) : null}
                    {testResult.costUsd != null && (
                      <div className="flex items-baseline justify-between">
                        <dt className="font-mono text-[10px] uppercase tracking-wider text-[color:color-mix(in_srgb,var(--ink)_50%,transparent)]">Cost</dt>
                        <dd className="font-mono text-[12px] text-[var(--ink)]">${testResult.costUsd.toFixed(4)}</dd>
                      </div>
                    )}
                    {savedPct != null && (
                      <div className="flex items-baseline justify-between">
                        <dt className="font-mono text-[10px] uppercase tracking-wider text-[color:color-mix(in_srgb,var(--ink)_50%,transparent)]">Saved vs {testResult.benchmarkModel || "benchmark"}</dt>
                        <dd className="font-mono text-[13px] font-semibold text-[var(--terracotta)]">{savedPct}%</dd>
                      </div>
                    )}
                  </dl>
                </div>
              )}

              {testResult && !testResult.ok && (
                <div role="alert" className="space-y-1 rounded-[2px] border border-[color:color-mix(in_srgb,var(--terracotta)_30%,transparent)] bg-[color:color-mix(in_srgb,var(--terracotta)_6%,transparent)] p-4">
                  <p className="text-[13px] font-semibold text-[var(--terracotta-d)]">Request failed</p>
                  <p className="break-words text-[12px] text-[color:color-mix(in_srgb,var(--ink)_60%,transparent)]">{testResult.message}</p>
                </div>
              )}

              <DailyQuotaBar />

              {/* ═══ THE CONVERSION MOMENT ═══ */}
              {billingActive ? (
                <div className="relative overflow-hidden rounded-[2px] border border-[color:color-mix(in_srgb,var(--ink)_20%,transparent)] bg-[var(--paper)] p-5">
                  <div className="flex items-center gap-3">
                    <VerifierSeal className="h-12 w-12 shrink-0" color="var(--terracotta)" />
                    <div>
                      <p className="font-editorial text-[19px] text-[var(--ink)]">Billing active, $7 loaded</p>
                      <p className="text-[13px] text-[color:color-mix(in_srgb,var(--ink)_60%,transparent)]">Unlimited routing unlocked. You only pay on what we save you.</p>
                    </div>
                  </div>
                  <InkButton className="mt-4 w-full" onClick={handleFinish}>
                    Finish setup <ArrowRight className="h-3.5 w-3.5" />
                  </InkButton>
                </div>
              ) : (
                <div className="relative overflow-hidden rounded-[3px] border-2 border-[var(--ink)] bg-[var(--paper)]">
                  {/* bonus stamp */}
                  <span className="absolute -right-8 top-4 rotate-12 bg-[var(--strawberry)] px-8 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--ink)] shadow-sm">
                    +$2 bonus
                  </span>
                  <div className="p-5">
                    <div className="flex items-center gap-2">
                      <Gift className="h-4 w-4 text-[var(--terracotta)]" />
                      <span className="eyebrow text-[color:color-mix(in_srgb,var(--ink)_60%,transparent)]">First-time offer</span>
                    </div>

                    <h3 className="mt-3 font-editorial text-[26px] leading-tight text-[var(--ink)]">
                      {savedPct != null ? (
                        <>You just saved <span className="text-[var(--terracotta)]">{savedPct}%</span>. Keep it going.</>
                      ) : (
                        <>Add <span className="text-[var(--terracotta)]">$5</span>, get <span className="text-[var(--terracotta)]">$7</span> of credit.</>
                      )}
                    </h3>

                    <p className="mt-2 text-[13.5px] leading-relaxed text-[color:color-mix(in_srgb,var(--ink)_70%,transparent)]">
                      Your first $5 becomes <span className="font-semibold text-[var(--ink)]">$7 of credit</span>, first time only.
                      No monthly fee, you only ever pay on what we save you. Cancel anytime.
                    </p>

                    <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2">
                      {[
                        "Unlimited requests",
                        "Semantic cache",
                        "Context optimization",
                        "Priority support",
                      ].map((b) => (
                        <div key={b} className="flex items-center gap-1.5 text-[12.5px] text-[color:color-mix(in_srgb,var(--ink)_70%,transparent)]">
                          <Check className="h-3.5 w-3.5 shrink-0 text-[var(--terracotta)]" />
                          <span>{b}</span>
                        </div>
                      ))}
                    </div>

                    <InkButton className="mt-5 w-full py-3.5" onClick={() => handleSubscribe("onboarding_offer")} disabled={subscribing}>
                      {subscribing ? (
                        <><Loader2 className="h-4 w-4 animate-spin" /> Redirecting...</>
                      ) : (
                        <>Add $5, get $7 of credit <ArrowRight className="h-3.5 w-3.5" /></>
                      )}
                    </InkButton>
                    <p className="mt-2 text-center font-mono text-[11px] text-[color:color-mix(in_srgb,var(--ink)_45%,transparent)]">
                      30 seconds with Stripe · card on file, no subscription
                    </p>

                    <div className="mt-4 flex justify-center">
                      <button
                        onClick={hasKey ? handleFinish : () => goToStep(0)}
                        className="text-[12px] text-[color:color-mix(in_srgb,var(--ink)_70%,transparent)] underline-offset-2 transition-colors hover:text-[var(--ink)] hover:underline"
                      >
                        I'll add it later, finish setup
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <CreateApiKeyDialog
          open={createDialogOpen}
          onClose={() => setCreateDialogOpen(false)}
          onCreate={handleCreateApiKey}
        />

        {/* Footer nav — Back only; finishing happens inside the step-1 block */}
        <div className="mt-5 flex items-center justify-between">
          {currentStep > 0 ? (
            <button
              onClick={() => goToStep(0)}
              className="inline-flex items-center gap-1.5 text-[13px] text-[color:color-mix(in_srgb,var(--ink)_55%,transparent)] transition-colors hover:text-[var(--ink)]"
            >
              <ArrowRight className="h-3.5 w-3.5 rotate-180" /> Back
            </button>
          ) : <span />}
          <SketchRule className="mx-4 hidden h-2 flex-1 opacity-25 sm:block" color="var(--ink)" />
          <span />
        </div>

        {isMobile && (
          <div className="mt-5 space-y-2 rounded-[2px] border border-[var(--line)] bg-[var(--shell)] p-4">
            <div className="flex items-center gap-2">
              <Monitor className="h-4 w-4 text-[var(--terracotta)]" />
              <span className="text-[13.5px] font-semibold text-[var(--ink)]">Finish on your computer?</span>
            </div>
            <p className="text-[12px] text-[color:color-mix(in_srgb,var(--ink)_60%,transparent)]">
              Making your first call is easier on a larger screen. We'll
              email a link to {user?.email ?? "your account"} so you can pick up
              right where you left off.
            </p>
            <OutlineButton
              className="w-full"
              onClick={handleEmailContinueLink}
              disabled={emailSending || emailSent}
            >
              {emailSending ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Sending...</>
              ) : emailSent ? (
                <><CircleCheck className="h-4 w-4 text-[var(--terracotta)]" /> Sent, check your inbox</>
              ) : (
                <><Mail className="h-4 w-4" /> Email me a link to continue on desktop</>
              )}
            </OutlineButton>
          </div>
        )}

        <div className="mt-6 flex justify-center pb-2">
          <button
            onClick={handleSkip}
            className="text-[12px] text-[color:color-mix(in_srgb,var(--ink)_70%,transparent)] underline-offset-2 transition-colors hover:text-[var(--ink)] hover:underline"
          >
            Skip onboarding for now
          </button>
        </div>
      </div>
    </div>
  );
};

export default Onboarding;
