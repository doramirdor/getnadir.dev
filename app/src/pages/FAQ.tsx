import { useEffect } from "react";
import { HelpCircle, ExternalLink } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { trackPageView } from "@/utils/analytics";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const faqItems = [
  {
    id: "routing",
    question: "How does intelligent routing work?",
    answer: (
      <>
        <p>
          When you send a request to Nadir, it goes through a multi-step
          pipeline before reaching a provider:
        </p>
        <ol className="list-decimal list-inside mt-2 space-y-1">
          <li>
            <strong>Complexity analysis</strong> -- Your prompt is analyzed by a
            lightweight ML model (a ~5 MB neural network) that scores its
            difficulty on factors like reasoning depth, domain specificity, and
            output structure.
          </li>
          <li>
            <strong>Tier assignment</strong> -- Based on the score, the request
            is classified into a tier (e.g. simple, moderate, complex) that maps
            to a class of models.
          </li>
          <li>
            <strong>Model selection</strong> -- Within the tier, Nadir picks the
            best available model considering provider health, latency, and your
            configured preferences.
          </li>
          <li>
            <strong>Fallback</strong> -- If the selected model is unavailable,
            Nadir walks a per-tier fallback chain so your request still
            succeeds.
          </li>
        </ol>
        <p className="mt-2">
          The result: simple prompts go to fast, cheap models while complex ones
          get routed to frontier models -- automatically, with no code changes
          on your side.
        </p>
      </>
    ),
  },
  {
    id: "byok-vs-hosted",
    question: "What is BYOK vs Hosted mode?",
    answer: (
      <>
        <p>Nadir supports two operating modes:</p>
        <ul className="list-disc list-inside mt-2 space-y-2">
          <li>
            <strong>BYOK (Bring Your Own Keys)</strong> -- You add your own
            provider API keys (OpenAI, Anthropic, Google, etc.) in the
            Integrations page. Nadir routes requests using your keys, so you pay
            providers at your own negotiated rate. You only pay Nadir a routing
            fee based on savings generated.
          </li>
          <li>
            <strong>Hosted mode</strong> -- Nadir provides shared API keys so
            you do not need any provider accounts. You pay pass-through token
            costs plus a savings-based fee. This is the fastest way to get
            started.
          </li>
        </ul>
        <p className="mt-2">
          You can switch modes or use both at any time from the Integrations
          page.
        </p>
      </>
    ),
  },
  {
    id: "savings-calculation",
    question: "How are savings calculated?",
    answer: (
      <>
        <p>
          Savings are measured by comparing what you actually paid against what
          the request <em>would have cost</em> if it had been sent to a
          benchmark model (typically GPT-4o or the most expensive model in the
          relevant tier).
        </p>
        <p className="mt-2">
          For example, if Nadir routes a simple question to GPT-4o-mini at
          $0.002 instead of GPT-4o at $0.03, your saving on that request is
          $0.028. The Savings page in your dashboard shows these numbers
          aggregated over time.
        </p>
      </>
    ),
  },
  {
    id: "savings-fee",
    question: "What does the savings fee cover?",
    answer: (
      <>
        <p>
          Nadir's pricing is designed so you only pay when routing saves you
          money:
        </p>
        <ul className="list-disc list-inside mt-2 space-y-1">
          <li>
            <strong>$9/month base</strong> -- Covers dashboard access, analytics,
            and the routing infrastructure.
          </li>
          <li>
            <strong>25% of the first $2,000 saved</strong> -- Nadir keeps a
            quarter of the savings it generates for you, up to $2K.
          </li>
          <li>
            <strong>10% of savings above $2,000</strong> -- The rate drops for
            higher-volume users.
          </li>
        </ul>
        <p className="mt-2">
          If Nadir does not save you anything in a billing cycle, you only pay
          the $9 base -- there is no per-request markup.
        </p>
      </>
    ),
  },
  {
    id: "add-provider-keys",
    question: "How do I add my provider API keys?",
    answer: (
      <p>
        Go to the{" "}
        <strong>Provider Keys</strong> page (under Manage in the sidebar).
        Click <em>Add Provider</em>, select your provider, and paste your API
        key. Keys are encrypted at rest and never logged. You can add, rotate,
        or remove keys at any time.
      </p>
    ),
  },
  {
    id: "provider-key-failure",
    question: "What happens if my provider key fails?",
    answer: (
      <>
        <p>
          Nadir maintains a per-tier fallback chain. If the primary model
          returns an authentication error, rate limit, or timeout, Nadir
          automatically retries with the next model in the chain. The provider
          health monitor tracks rolling success rates and deprioritizes
          unhealthy providers in future routing decisions.
        </p>
        <p className="mt-2">
          You can view provider health status on the Dashboard and configure
          fallback preferences in Settings.
        </p>
      </>
    ),
  },
  {
    id: "context-optimize",
    question: "How does Context Optimize work?",
    answer: (
      <>
        <p>
          Context Optimize reduces token usage (and cost) by intelligently
          trimming or restructuring the context sent to the model. It has two
          modes:
        </p>
        <ul className="list-disc list-inside mt-2 space-y-2">
          <li>
            <strong>Safe mode</strong> -- Removes redundant whitespace,
            duplicate system instructions, and other low-signal tokens. This
            never changes the semantic meaning of your prompt.
          </li>
          <li>
            <strong>Aggressive mode</strong> -- Additionally summarizes long
            conversation histories and truncates large tool outputs. This can
            yield larger savings but may occasionally remove relevant context.
          </li>
        </ul>
        <p className="mt-2">
          You can enable or disable Context Optimize globally in Settings, or
          per-request via the <code className="text-xs bg-muted px-1 py-0.5 rounded">X-Context-Optimize</code> header.
        </p>
      </>
    ),
  },
  {
    id: "spending-limit",
    question: "Can I set a spending limit?",
    answer: (
      <p>
        Yes. Navigate to <strong>Settings</strong> to configure a monthly budget
        cap. Once you reach the limit, Nadir will reject new requests with a
        clear error message until the next billing cycle (or until you raise the
        cap). You can also set per-key limits from the API Keys page.
      </p>
    ),
  },
  {
    id: "cancel-subscription",
    question: "How do I cancel my subscription?",
    answer: (
      <p>
        Go to the <strong>Billing</strong> page and click{" "}
        <em>Cancel Subscription</em>. Your access continues until the end of
        the current billing period. After cancellation, your API keys will stop
        working but your data (analytics, logs) remains available for 30 days in
        case you decide to reactivate.
      </p>
    ),
  },
  {
    id: "data-security",
    question: "Is my data secure?",
    answer: (
      <>
        <p>
          Security is a core design principle:
        </p>
        <ul className="list-disc list-inside mt-2 space-y-1">
          <li>
            <strong>Row Level Security (RLS)</strong> -- Every database table
            uses Supabase RLS policies so users can only access their own data.
          </li>
          <li>
            <strong>Encryption</strong> -- Provider keys are encrypted at rest.
            All traffic is TLS-encrypted in transit.
          </li>
          <li>
            <strong>No prompt storage</strong> -- Nadir does not store the
            content of your prompts or completions. Only metadata (token counts,
            model used, latency, cost) is logged for analytics.
          </li>
          <li>
            <strong>API key hashing</strong> -- Your Nadir API keys are stored
            as SHA-256 hashes; the raw key is shown only once at creation time.
          </li>
        </ul>
      </>
    ),
  },
];

const FAQ = () => {
  const navigate = useNavigate();
  useEffect(() => { trackPageView("faq"); }, []);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <div className="flex items-center gap-2.5 mb-1">
          <HelpCircle className="w-5 h-5 text-primary" />
          <h1 className="page-title">Help &amp; FAQ</h1>
        </div>
        <p className="page-description">
          Common questions about using the Nadir dashboard and routing platform.
        </p>
      </div>

      <Accordion type="single" collapsible className="w-full">
        {faqItems.map((item) => (
          <AccordionItem key={item.id} value={item.id}>
            <AccordionTrigger className="text-left text-[15px]">
              {item.question}
            </AccordionTrigger>
            <AccordionContent className="text-muted-foreground leading-relaxed">
              {item.answer}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>

      <div className="pt-4 border-t">
        <p className="text-sm text-muted-foreground">
          Still have questions?{" "}
          <button
            onClick={() => navigate("/dashboard/settings")}
            className="text-primary hover:underline font-medium inline-flex items-center gap-1"
          >
            Contact support
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
        </p>
      </div>
    </div>
  );
};

export default FAQ;
