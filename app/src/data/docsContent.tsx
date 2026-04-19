import { CodeBlock } from "@/components/docs/CodeBlock";
import { CodeTabs } from "@/components/docs/CodeTabs";
import { Param } from "@/components/docs/Param";
import { EndpointHeader } from "@/components/docs/EndpointHeader";
import { Callout } from "@/components/docs/Callout";
import { ChevronRight } from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Helper                                                             */
/* ------------------------------------------------------------------ */

const InlineCode = ({ children }: { children: React.ReactNode }) => (
  <code className="text-foreground bg-muted px-1.5 py-0.5 rounded text-sm">
    {children}
  </code>
);

const H2 = ({ children }: { children: React.ReactNode }) => (
  <h2 className="text-2xl font-semibold text-foreground">{children}</h2>
);

const H3 = ({ children }: { children: React.ReactNode }) => (
  <h3 className="text-lg font-semibold text-foreground">{children}</h3>
);

const P = ({ children }: { children: React.ReactNode }) => (
  <p className="text-muted-foreground leading-relaxed">{children}</p>
);

const FeatureCard = ({
  title,
  desc,
}: {
  title: string;
  desc: string;
}) => (
  <div className="rounded-lg border border-border p-5 space-y-2">
    <h3 className="font-semibold text-foreground text-sm">{title}</h3>
    <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
  </div>
);

const BulletItem = ({ children }: { children: React.ReactNode }) => (
  <li className="flex items-start gap-2">
    <ChevronRight className="h-4 w-4 shrink-0 mt-0.5 text-primary" />
    <span>{children}</span>
  </li>
);

/* ================================================================== */
/*  1. QUICKSTART (Pro / Hosted)                                       */
/* ================================================================== */

export function QuickstartContent() {
  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <h1 className="text-3xl font-semibold text-foreground">Quick Start</h1>
        <P>
          Get started with the Nadir hosted platform in under a minute.
          No server to run, no infra to manage. Sign up, grab an API key,
          and point your code to <InlineCode>api.getnadir.com</InlineCode>.
        </P>
      </div>

      <div className="space-y-4">
        <H2>1. Create an account</H2>
        <P>
          Sign up at{" "}
          <a href="/auth?mode=signup" className="text-primary underline underline-offset-2">
            getnadir.com/auth
          </a>
          . The free tier gives you 15 requests/day with your own API keys (BYOK).
          Subscribe to Pro for unlimited requests and hosted keys.
        </P>
      </div>

      <div className="space-y-4">
        <H2>2. Get your API key</H2>
        <P>
          After signing up, go to the{" "}
          <a href="/dashboard/api-keys" className="text-primary underline underline-offset-2">
            API Keys page
          </a>{" "}
          in your dashboard and copy your key.
        </P>
      </div>

      <div className="space-y-4">
        <H2>3. Make a request</H2>
        <P>
          Use the OpenAI-compatible endpoint. Just change the base URL and API key.
        </P>

        <CodeTabs
          examples={[
            {
              label: "Python",
              language: "python",
              code: `import openai

client = openai.OpenAI(
    base_url="https://api.getnadir.com/v1",
    api_key="YOUR_NADIR_API_KEY",
)

response = client.chat.completions.create(
    messages=[{"role": "user", "content": "Explain quantum computing"}],
    model="auto",  # Nadir picks the best model
)

print(response.choices[0].message.content)`,
            },
            {
              label: "cURL",
              language: "curl",
              code: `curl https://api.getnadir.com/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: YOUR_NADIR_API_KEY" \\
  -d '{
    "messages": [
      {"role": "user", "content": "Explain quantum computing"}
    ],
    "model": "auto"
  }'`,
            },
          ]}
        />
      </div>

      <Callout type="tip">
        Set <InlineCode>model</InlineCode> to <InlineCode>"auto"</InlineCode> to
        let Nadir's classifier pick the most cost-effective model. Or specify a
        model name like <InlineCode>"claude-sonnet-4-20250514"</InlineCode> to
        pin the request.
      </Callout>

      <Callout type="info">
        Want to self-host instead? Check the{" "}
        <a href="/docs/self-host" className="text-primary underline underline-offset-2">
          Self-Host guide
        </a>{" "}
        to run NadirClaw on your own machine.
      </Callout>
    </div>
  );
}

/* ================================================================== */
/*  1b. SELF-HOST QUICKSTART                                           */
/* ================================================================== */

export function SelfHostContent() {
  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <h1 className="text-3xl font-semibold text-foreground">Self-Host (NadirClaw)</h1>
        <P>
          NadirClaw is a self-hosted, open-source CLI LLM router that
          automatically routes each request to the best model for the job.
          MIT licensed, runs locally, unlimited requests.
        </P>
      </div>

      <div className="space-y-4">
        <H2>1. Install</H2>
        <CodeBlock label="Install via pip">{`pip install nadirClaw`}</CodeBlock>
      </div>

      <div className="space-y-4">
        <H2>2. Setup</H2>
        <P>
          Run the interactive setup wizard. It will ask for your provider API
          keys and let you pick which models to use for simple and complex
          requests.
        </P>
        <CodeBlock label="Interactive setup">{`nadirclaw setup`}</CodeBlock>
      </div>

      <div className="space-y-4">
        <H2>3. Serve</H2>
        <P>
          Start the local router. By default it listens on port 8856.
        </P>
        <CodeBlock label="Start the router">{`nadirclaw serve`}</CodeBlock>
      </div>

      <div className="space-y-4">
        <H2>4. Point your tools</H2>
        <P>
          Set your base URL to <InlineCode>http://localhost:8856/v1</InlineCode>{" "}
          and your API key to <InlineCode>local</InlineCode>. Any
          OpenAI-compatible client works out of the box.
        </P>

        <CodeTabs
          examples={[
            {
              label: "Python",
              language: "python",
              code: `import openai

client = openai.OpenAI(
    base_url="http://localhost:8856/v1",
    api_key="local",
)

response = client.chat.completions.create(
    messages=[{"role": "user", "content": "Explain quantum computing"}],
    model="auto",  # let NadirClaw choose the best model
)

print(response.choices[0].message.content)`,
            },
            {
              label: "cURL",
              language: "curl",
              code: `curl http://localhost:8856/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer local" \\
  -d '{
    "messages": [
      {"role": "user", "content": "Explain quantum computing"}
    ],
    "model": "auto"
  }'`,
            },
          ]}
        />
      </div>

      <div className="space-y-4">
        <H2>5. Understand the response</H2>
        <P>
          Responses follow the OpenAI format with an additional{" "}
          <InlineCode>nadirclaw_metadata</InlineCode> field showing routing
          decisions, latency, cost, and token savings.
        </P>

        <CodeBlock label="Example response">{`{
  "id": "nadirclaw-a1b2c3d4",
  "object": "chat.completion",
  "model": "gemini-2.0-flash",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "Quantum computing uses qubits..."
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 12,
    "completion_tokens": 85,
    "total_tokens": 97
  },
  "nadirclaw_metadata": {
    "complexity_tier": "simple",
    "routed_model": "gemini-2.0-flash",
    "latency_ms": 420,
    "cost_usd": 0.00003,
    "tokens_saved": 0
  }
}`}</CodeBlock>
      </div>

      <Callout type="tip">
        Set <InlineCode>model</InlineCode> to <InlineCode>"auto"</InlineCode> (or
        omit it) to let NadirClaw's classifier pick the most cost-effective model.
        Or specify a model name like <InlineCode>"claude-sonnet-4-20250514"</InlineCode> to
        pin the request.
      </Callout>
    </div>
  );
}

/* ================================================================== */
/*  2. INSTALLATION                                                    */
/* ================================================================== */

export function InstallationContent() {
  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <h1 className="text-3xl font-semibold text-foreground">Installation</h1>
        <P>
          NadirClaw requires Python 3.10 or later. Pick whichever installation
          method suits your workflow.
        </P>
      </div>

      <div className="space-y-4">
        <H2>Quick install (pip)</H2>
        <CodeBlock label="pip">{`pip install nadirClaw`}</CodeBlock>
      </div>

      <div className="space-y-4">
        <H2>Shell script</H2>
        <CodeBlock label="curl">{`curl -fsSL https://raw.githubusercontent.com/NadirRouter/NadirClaw/main/install.sh | sh`}</CodeBlock>
      </div>

      <div className="space-y-4">
        <H2>Manual (git clone)</H2>
        <CodeBlock label="git">{`git clone https://github.com/NadirRouter/NadirClaw.git
cd NadirClaw
pip install -e .`}</CodeBlock>
      </div>

      <div className="space-y-4">
        <H2>Docker</H2>
        <CodeBlock label="docker">{`git clone https://github.com/NadirRouter/NadirClaw.git
cd NadirClaw
docker compose up`}</CodeBlock>
      </div>

      <div className="space-y-4">
        <H2>Optional extras</H2>
        <P>
          Install additional capabilities as needed:
        </P>
        <CodeBlock label="extras">{`# Web dashboard UI
pip install nadirclaw[dashboard]

# OpenTelemetry + Prometheus metrics
pip install nadirclaw[telemetry]`}</CodeBlock>
      </div>

      <div className="space-y-4">
        <H2>Uninstall</H2>
        <CodeBlock label="uninstall">{`pip uninstall nadirclaw
rm -rf ~/.nadirclaw && sudo rm -f /usr/local/bin/nadirclaw`}</CodeBlock>
      </div>

      <Callout type="info">
        NadirClaw stores its configuration and local data in{" "}
        <InlineCode>~/.nadirclaw</InlineCode>. Removing that directory fully
        cleans up all local state.
      </Callout>
    </div>
  );
}

/* ================================================================== */
/*  3. CONFIGURATION                                                   */
/* ================================================================== */

export function ConfigurationContent() {
  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <h1 className="text-3xl font-semibold text-foreground">Configuration</h1>
        <P>
          All configuration lives in{" "}
          <InlineCode>~/.nadirclaw/.env</InlineCode>. Run{" "}
          <InlineCode>nadirclaw setup</InlineCode> to generate it interactively,
          or edit it by hand.
        </P>
      </div>

      <div className="space-y-4">
        <H2>Model configuration</H2>
        <P>
          Define which models NadirClaw routes to for each complexity tier.
        </P>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left px-4 py-3 font-semibold text-foreground">Variable</th>
                <th className="text-left px-4 py-3 font-semibold text-foreground">Description</th>
              </tr>
            </thead>
            <tbody className="text-muted-foreground">
              <tr className="border-b border-border">
                <td className="px-4 py-3"><InlineCode>NADIRCLAW_SIMPLE_MODEL</InlineCode></td>
                <td className="px-4 py-3">Model for simple requests (e.g. gemini-2.0-flash)</td>
              </tr>
              <tr className="border-b border-border">
                <td className="px-4 py-3"><InlineCode>NADIRCLAW_COMPLEX_MODEL</InlineCode></td>
                <td className="px-4 py-3">Model for complex requests (e.g. claude-sonnet-4-20250514)</td>
              </tr>
              <tr className="border-b border-border">
                <td className="px-4 py-3"><InlineCode>NADIRCLAW_MID_MODEL</InlineCode></td>
                <td className="px-4 py-3">Optional mid-tier model for 3-tier routing</td>
              </tr>
              <tr className="border-b border-border">
                <td className="px-4 py-3"><InlineCode>NADIRCLAW_REASONING_MODEL</InlineCode></td>
                <td className="px-4 py-3">Model for reasoning-heavy tasks (e.g. o3)</td>
              </tr>
              <tr>
                <td className="px-4 py-3"><InlineCode>NADIRCLAW_FREE_MODEL</InlineCode></td>
                <td className="px-4 py-3">Model for free/budget routing profile</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-4">
        <H2>Provider keys</H2>
        <P>
          Add API keys for each provider you want NadirClaw to route to.
        </P>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left px-4 py-3 font-semibold text-foreground">Variable</th>
                <th className="text-left px-4 py-3 font-semibold text-foreground">Provider</th>
              </tr>
            </thead>
            <tbody className="text-muted-foreground">
              <tr className="border-b border-border">
                <td className="px-4 py-3"><InlineCode>GEMINI_API_KEY</InlineCode></td>
                <td className="px-4 py-3">Google Gemini</td>
              </tr>
              <tr className="border-b border-border">
                <td className="px-4 py-3"><InlineCode>ANTHROPIC_API_KEY</InlineCode></td>
                <td className="px-4 py-3">Anthropic Claude</td>
              </tr>
              <tr>
                <td className="px-4 py-3"><InlineCode>OPENAI_API_KEY</InlineCode></td>
                <td className="px-4 py-3">OpenAI</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-4">
        <H2>Routing</H2>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left px-4 py-3 font-semibold text-foreground">Variable</th>
                <th className="text-left px-4 py-3 font-semibold text-foreground">Description</th>
              </tr>
            </thead>
            <tbody className="text-muted-foreground">
              <tr className="border-b border-border">
                <td className="px-4 py-3"><InlineCode>NADIRCLAW_CONFIDENCE_THRESHOLD</InlineCode></td>
                <td className="px-4 py-3">Classifier confidence required to route to simple model (default 0.7)</td>
              </tr>
              <tr className="border-b border-border">
                <td className="px-4 py-3"><InlineCode>NADIRCLAW_CLASSIFIER</InlineCode></td>
                <td className="px-4 py-3"><InlineCode>binary</InlineCode> (default) or <InlineCode>cascade</InlineCode> for 3-tier</td>
              </tr>
              <tr>
                <td className="px-4 py-3"><InlineCode>NADIRCLAW_TIER_THRESHOLDS</InlineCode></td>
                <td className="px-4 py-3">Comma-separated thresholds for cascade classifier (e.g. 0.3,0.7)</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-4">
        <H2>Context Optimize</H2>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left px-4 py-3 font-semibold text-foreground">Variable</th>
                <th className="text-left px-4 py-3 font-semibold text-foreground">Description</th>
              </tr>
            </thead>
            <tbody className="text-muted-foreground">
              <tr>
                <td className="px-4 py-3"><InlineCode>NADIRCLAW_OPTIMIZE</InlineCode></td>
                <td className="px-4 py-3"><InlineCode>off</InlineCode> (default), <InlineCode>safe</InlineCode> (lossless), or <InlineCode>aggressive</InlineCode> (coming soon)</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-4">
        <H2>Caching</H2>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left px-4 py-3 font-semibold text-foreground">Variable</th>
                <th className="text-left px-4 py-3 font-semibold text-foreground">Description</th>
              </tr>
            </thead>
            <tbody className="text-muted-foreground">
              <tr className="border-b border-border">
                <td className="px-4 py-3"><InlineCode>NADIRCLAW_CACHE_TTL</InlineCode></td>
                <td className="px-4 py-3">Cache time-to-live in seconds</td>
              </tr>
              <tr>
                <td className="px-4 py-3"><InlineCode>NADIRCLAW_CACHE_MAX_SIZE</InlineCode></td>
                <td className="px-4 py-3">Maximum number of cached entries</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-4">
        <H2>Budget controls</H2>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left px-4 py-3 font-semibold text-foreground">Variable</th>
                <th className="text-left px-4 py-3 font-semibold text-foreground">Description</th>
              </tr>
            </thead>
            <tbody className="text-muted-foreground">
              <tr className="border-b border-border">
                <td className="px-4 py-3"><InlineCode>NADIRCLAW_DAILY_BUDGET</InlineCode></td>
                <td className="px-4 py-3">Maximum daily spend in USD</td>
              </tr>
              <tr className="border-b border-border">
                <td className="px-4 py-3"><InlineCode>NADIRCLAW_MONTHLY_BUDGET</InlineCode></td>
                <td className="px-4 py-3">Maximum monthly spend in USD</td>
              </tr>
              <tr>
                <td className="px-4 py-3"><InlineCode>NADIRCLAW_BUDGET_WARN_THRESHOLD</InlineCode></td>
                <td className="px-4 py-3">Percentage at which to warn (e.g. 0.8 for 80%)</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-4">
        <H2>Server</H2>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left px-4 py-3 font-semibold text-foreground">Variable</th>
                <th className="text-left px-4 py-3 font-semibold text-foreground">Description</th>
              </tr>
            </thead>
            <tbody className="text-muted-foreground">
              <tr className="border-b border-border">
                <td className="px-4 py-3"><InlineCode>NADIRCLAW_PORT</InlineCode></td>
                <td className="px-4 py-3">Port to listen on (default 8856)</td>
              </tr>
              <tr className="border-b border-border">
                <td className="px-4 py-3"><InlineCode>NADIRCLAW_LOG_RAW</InlineCode></td>
                <td className="px-4 py-3">Log raw request/response payloads (true/false)</td>
              </tr>
              <tr>
                <td className="px-4 py-3"><InlineCode>NADIRCLAW_AUTH_TOKEN</InlineCode></td>
                <td className="px-4 py-3">Custom auth token (defaults to "local")</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-4">
        <H2>Full example .env</H2>
        <CodeBlock label="~/.nadirclaw/.env">{`# Provider keys
GEMINI_API_KEY=AIza...
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...

# Models
NADIRCLAW_SIMPLE_MODEL=gemini-2.0-flash
NADIRCLAW_COMPLEX_MODEL=claude-sonnet-4-20250514
NADIRCLAW_REASONING_MODEL=o3
NADIRCLAW_FREE_MODEL=gemini-2.0-flash

# Routing
NADIRCLAW_CLASSIFIER=binary
NADIRCLAW_CONFIDENCE_THRESHOLD=0.7

# Context Optimize
NADIRCLAW_OPTIMIZE=safe

# Budget
NADIRCLAW_DAILY_BUDGET=10.00
NADIRCLAW_MONTHLY_BUDGET=200.00
NADIRCLAW_BUDGET_WARN_THRESHOLD=0.8

# Server
NADIRCLAW_PORT=8856
NADIRCLAW_AUTH_TOKEN=local`}</CodeBlock>
      </div>
    </div>
  );
}

/* ================================================================== */
/*  4. SMART ROUTING                                                   */
/* ================================================================== */

export function SmartRoutingContent() {
  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <h1 className="text-3xl font-semibold text-foreground">Smart Routing</h1>
        <P>
          NadirClaw uses a binary classifier built on sentence embeddings to
          decide whether a prompt is simple or complex. Classification adds
          roughly 10ms of overhead per request.
        </P>
      </div>

      <div className="space-y-4">
        <H2>How it works</H2>
        <P>
          By default, NadirClaw routes across two tiers:
        </P>
        <ul className="space-y-2 text-sm text-muted-foreground">
          <BulletItem><strong className="text-foreground">Simple</strong> -- routed to your cheap model (e.g. Gemini Flash, GPT-4o Mini)</BulletItem>
          <BulletItem><strong className="text-foreground">Complex</strong> -- routed to your premium model (e.g. Claude Sonnet, GPT-4o)</BulletItem>
        </ul>
        <P>
          Set <InlineCode>NADIRCLAW_CLASSIFIER=cascade</InlineCode> and add a{" "}
          <InlineCode>NADIRCLAW_MID_MODEL</InlineCode> to enable optional 3-tier
          routing with a mid-range model in between.
        </P>
      </div>

      <div className="space-y-4">
        <H2>Routing modifiers</H2>
        <P>
          Beyond the base classifier, NadirClaw applies a set of heuristic
          modifiers that override or adjust the routing decision:
        </P>
        <div className="grid gap-4 sm:grid-cols-2">
          <FeatureCard
            title="Agentic detection"
            desc="Tool-use calls, agent system prompts, or conversations with more than 10 messages are automatically routed to the complex model."
          />
          <FeatureCard
            title="Reasoning detection"
            desc='Prompts containing phrases like "step by step", "think carefully", or "reason through" are routed to the reasoning model when configured.'
          />
          <FeatureCard
            title="Vision routing"
            desc="Requests containing image content parts are automatically detected and routed to a vision-capable model."
          />
          <FeatureCard
            title="Session persistence"
            desc="Multi-turn conversations stick to the same model for the entire session (30-minute TTL) to maintain consistency."
          />
          <FeatureCard
            title="Context window filtering"
            desc="If a prompt exceeds a model's context window, NadirClaw automatically selects a model with a larger window."
          />
        </div>
      </div>

      <div className="space-y-4">
        <H2>Test the classifier</H2>
        <P>
          Use the CLI to see how NadirClaw would classify a prompt without
          making an actual LLM call:
        </P>
        <CodeBlock label="Classify a prompt">{`nadirclaw classify "Explain the tradeoffs between microservices and monoliths"

# Output:
# Tier:       complex
# Confidence: 0.91
# Model:      claude-sonnet-4-20250514
# Modifiers:  none`}</CodeBlock>
      </div>

      <div className="space-y-4">
        <H2>Routing profiles</H2>
        <P>
          Set <InlineCode>model</InlineCode> in your request to one of these
          profile names to override the default routing behaviour:
        </P>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left px-4 py-3 font-semibold text-foreground">Profile</th>
                <th className="text-left px-4 py-3 font-semibold text-foreground">Behaviour</th>
              </tr>
            </thead>
            <tbody className="text-muted-foreground">
              <tr className="border-b border-border">
                <td className="px-4 py-3"><InlineCode>auto</InlineCode></td>
                <td className="px-4 py-3">Default -- classifier decides (simple or complex)</td>
              </tr>
              <tr className="border-b border-border">
                <td className="px-4 py-3"><InlineCode>eco</InlineCode></td>
                <td className="px-4 py-3">Always route to the simple model</td>
              </tr>
              <tr className="border-b border-border">
                <td className="px-4 py-3"><InlineCode>premium</InlineCode></td>
                <td className="px-4 py-3">Always route to the complex model</td>
              </tr>
              <tr className="border-b border-border">
                <td className="px-4 py-3"><InlineCode>free</InlineCode></td>
                <td className="px-4 py-3">Route to the free model</td>
              </tr>
              <tr>
                <td className="px-4 py-3"><InlineCode>reasoning</InlineCode></td>
                <td className="px-4 py-3">Route to the reasoning model</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-4">
        <H2>Model aliases</H2>
        <P>
          For convenience, NadirClaw recognises short aliases for popular models:
        </P>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left px-4 py-3 font-semibold text-foreground">Alias</th>
                <th className="text-left px-4 py-3 font-semibold text-foreground">Model</th>
              </tr>
            </thead>
            <tbody className="text-muted-foreground">
              <tr className="border-b border-border">
                <td className="px-4 py-3"><InlineCode>sonnet</InlineCode></td>
                <td className="px-4 py-3">claude-sonnet-4-20250514</td>
              </tr>
              <tr className="border-b border-border">
                <td className="px-4 py-3"><InlineCode>opus</InlineCode></td>
                <td className="px-4 py-3">claude-opus-4-20250514</td>
              </tr>
              <tr className="border-b border-border">
                <td className="px-4 py-3"><InlineCode>haiku</InlineCode></td>
                <td className="px-4 py-3">claude-3-5-haiku-20241022</td>
              </tr>
              <tr className="border-b border-border">
                <td className="px-4 py-3"><InlineCode>gpt4</InlineCode></td>
                <td className="px-4 py-3">gpt-4o</td>
              </tr>
              <tr className="border-b border-border">
                <td className="px-4 py-3"><InlineCode>gpt5</InlineCode></td>
                <td className="px-4 py-3">gpt-5</td>
              </tr>
              <tr className="border-b border-border">
                <td className="px-4 py-3"><InlineCode>flash</InlineCode></td>
                <td className="px-4 py-3">gemini-2.0-flash</td>
              </tr>
              <tr className="border-b border-border">
                <td className="px-4 py-3"><InlineCode>gemini-pro</InlineCode></td>
                <td className="px-4 py-3">gemini-2.5-pro</td>
              </tr>
              <tr className="border-b border-border">
                <td className="px-4 py-3"><InlineCode>deepseek</InlineCode></td>
                <td className="px-4 py-3">deepseek-chat</td>
              </tr>
              <tr>
                <td className="px-4 py-3"><InlineCode>llama</InlineCode></td>
                <td className="px-4 py-3">llama-3.3-70b</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ================================================================== */
/*  5. CONTEXT OPTIMIZE                                                */
/* ================================================================== */

export function ContextOptimizeContent() {
  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <h1 className="text-3xl font-semibold text-foreground">Context Optimize</h1>
        <P>
          Context Optimize reduces token counts before requests hit your LLM
          provider, cutting costs without changing the meaning of your prompts.
        </P>
      </div>

      <div className="space-y-4">
        <H2>Modes</H2>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left px-4 py-3 font-semibold text-foreground">Mode</th>
                <th className="text-left px-4 py-3 font-semibold text-foreground">Description</th>
              </tr>
            </thead>
            <tbody className="text-muted-foreground">
              <tr className="border-b border-border">
                <td className="px-4 py-3"><InlineCode>off</InlineCode></td>
                <td className="px-4 py-3">Default. No optimization applied.</td>
              </tr>
              <tr className="border-b border-border">
                <td className="px-4 py-3"><InlineCode>safe</InlineCode></td>
                <td className="px-4 py-3">Lossless optimizations only. Zero semantic change to your prompts.</td>
              </tr>
              <tr>
                <td className="px-4 py-3"><InlineCode>aggressive</InlineCode></td>
                <td className="px-4 py-3">Coming soon. Lossy optimizations for maximum savings.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-4">
        <H2>What safe mode does</H2>
        <ul className="space-y-2 text-sm text-muted-foreground">
          <BulletItem><strong className="text-foreground">JSON minification</strong> -- Removes unnecessary whitespace and formatting from JSON payloads in messages.</BulletItem>
          <BulletItem><strong className="text-foreground">Tool schema deduplication</strong> -- Deduplicates repeated tool/function schemas across messages.</BulletItem>
          <BulletItem><strong className="text-foreground">Whitespace normalization</strong> -- Collapses redundant whitespace, blank lines, and trailing spaces.</BulletItem>
          <BulletItem><strong className="text-foreground">Chat history trimming</strong> -- Trims older messages that exceed the context window while preserving the most recent context.</BulletItem>
        </ul>
      </div>

      <div className="space-y-4">
        <H2>Token savings</H2>
        <P>
          Real-world savings measured across common workloads:
        </P>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left px-4 py-3 font-semibold text-foreground">Workload</th>
                <th className="text-left px-4 py-3 font-semibold text-foreground">Token reduction</th>
              </tr>
            </thead>
            <tbody className="text-muted-foreground">
              <tr className="border-b border-border">
                <td className="px-4 py-3">Agentic assistant</td>
                <td className="px-4 py-3">57%</td>
              </tr>
              <tr className="border-b border-border">
                <td className="px-4 py-3">RAG pipeline</td>
                <td className="px-4 py-3">29%</td>
              </tr>
              <tr className="border-b border-border">
                <td className="px-4 py-3">API response processing</td>
                <td className="px-4 py-3">62%</td>
              </tr>
              <tr className="border-b border-border">
                <td className="px-4 py-3">Debug session</td>
                <td className="px-4 py-3">63%</td>
              </tr>
              <tr>
                <td className="px-4 py-3">OpenAPI spec</td>
                <td className="px-4 py-3">71%</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-4">
        <H2>Enable</H2>
        <CodeBlock label="Via CLI flag">{`nadirclaw serve --optimize safe`}</CodeBlock>
        <CodeBlock label="Via .env">{`NADIRCLAW_OPTIMIZE=safe`}</CodeBlock>
      </div>

      <div className="space-y-4">
        <H2>Test on a file</H2>
        <P>
          Preview optimization results on a saved payload without starting the
          server:
        </P>
        <CodeBlock label="Test optimize">{`nadirclaw optimize payload.json

# Output:
# Original tokens:  4,218
# Optimized tokens:  1,803
# Saved:            2,415 (57.3%)
# Mode:             safe (lossless)`}</CodeBlock>
      </div>

      <Callout type="tip">
        Safe mode is fully lossless -- zero semantic change to your prompts.
        Every optimization is reversible and preserves the exact meaning of
        your messages.
      </Callout>
    </div>
  );
}

/* ================================================================== */
/*  6. FALLBACKS                                                       */
/* ================================================================== */

export function FallbacksContent() {
  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <h1 className="text-3xl font-semibold text-foreground">Fallbacks & Budget</h1>
        <P>
          NadirClaw provides automatic fallback chains and budget controls to
          keep your LLM usage resilient and predictable.
        </P>
      </div>

      <div className="space-y-4">
        <H2>Fallback chains</H2>
        <P>
          Define an ordered list of models to try when the primary model fails.
          NadirClaw moves to the next model in the chain on any trigger
          condition.
        </P>
        <CodeBlock label="~/.nadirclaw/.env">{`NADIRCLAW_FALLBACK_CHAIN=claude-sonnet-4-20250514,gpt-4o,gemini-2.5-pro`}</CodeBlock>
      </div>

      <div className="space-y-4">
        <H2>Trigger conditions</H2>
        <ul className="space-y-2 text-sm text-muted-foreground">
          <BulletItem><strong className="text-foreground">429 rate limit</strong> -- Provider returns a rate-limit error.</BulletItem>
          <BulletItem><strong className="text-foreground">5xx server error</strong> -- Provider returns any server-side error.</BulletItem>
          <BulletItem><strong className="text-foreground">Timeout</strong> -- Request exceeds the configured timeout.</BulletItem>
        </ul>
      </div>

      <div className="space-y-4">
        <H2>Per-model rate limits</H2>
        <P>
          Proactively throttle requests to avoid hitting provider rate limits:
        </P>
        <CodeBlock label="~/.nadirclaw/.env">{`# JSON map of model -> requests per minute
NADIRCLAW_MODEL_RATE_LIMITS={"claude-sonnet-4-20250514": 60, "gpt-4o": 100}

# Default RPM for models not in the map
NADIRCLAW_DEFAULT_MODEL_RPM=50`}</CodeBlock>
      </div>

      <div className="space-y-4">
        <H2>Budget controls</H2>
        <P>
          Set daily and monthly spending limits. NadirClaw tracks cost in real
          time and alerts or blocks requests when thresholds are reached.
        </P>
        <CodeBlock label="~/.nadirclaw/.env">{`NADIRCLAW_DAILY_BUDGET=10.00
NADIRCLAW_MONTHLY_BUDGET=200.00
NADIRCLAW_BUDGET_WARN_THRESHOLD=0.8`}</CodeBlock>
      </div>

      <div className="space-y-4">
        <H2>Check budget status</H2>
        <CodeBlock label="Budget command">{`nadirclaw budget

# Output:
# Daily budget:    $10.00
# Spent today:     $3.47 (34.7%)
# Monthly budget:  $200.00
# Spent this month: $42.18 (21.1%)
# Status:          OK`}</CodeBlock>
      </div>
    </div>
  );
}

/* ================================================================== */
/*  7. CLAUDE CODE                                                     */
/* ================================================================== */

export function ClaudeCodeContent() {
  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <h1 className="text-3xl font-semibold text-foreground">Claude Code</h1>
        <P>
          Route Claude Code through NadirClaw with two environment variables.
          NadirClaw will classify each request and route simple prompts to a
          cheaper model while sending complex ones to Claude.
        </P>
      </div>

      <div className="space-y-4">
        <H2>Setup</H2>
        <P>
          Set the following environment variables before launching Claude Code:
        </P>
        <CodeBlock label="Shell">{`export ANTHROPIC_BASE_URL=http://localhost:8856/v1
export ANTHROPIC_API_KEY=local`}</CodeBlock>
        <P>
          That's it. Claude Code now routes through NadirClaw.
        </P>
      </div>

      <div className="space-y-4">
        <H2>Cost savings</H2>
        <P>
          A typical Claude Code session sends many simple requests (file reads,
          short questions, confirmations) alongside complex ones (architecture
          decisions, large refactors). NadirClaw routes the simple ones to a
          cheaper model.
        </P>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left px-4 py-3 font-semibold text-foreground">Scenario</th>
                <th className="text-left px-4 py-3 font-semibold text-foreground">Without NadirClaw</th>
                <th className="text-left px-4 py-3 font-semibold text-foreground">With NadirClaw</th>
              </tr>
            </thead>
            <tbody className="text-muted-foreground">
              <tr className="border-b border-border">
                <td className="px-4 py-3">1-hour coding session</td>
                <td className="px-4 py-3">~$4.20</td>
                <td className="px-4 py-3">~$1.60</td>
              </tr>
              <tr>
                <td className="px-4 py-3">Full workday (8 hrs)</td>
                <td className="px-4 py-3">~$33.60</td>
                <td className="px-4 py-3">~$12.80</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <Callout type="info">
        Session persistence ensures that multi-turn conversations within
        Claude Code stick to the same model for the entire session (30-minute
        TTL), maintaining consistency across related requests.
      </Callout>
    </div>
  );
}

/* ================================================================== */
/*  8. OPENCLAW                                                        */
/* ================================================================== */

export function OpenClawContent() {
  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <h1 className="text-3xl font-semibold text-foreground">OpenClaw</h1>
        <P>
          NadirClaw integrates with OpenClaw as a model provider. Run a single
          command to configure everything automatically.
        </P>
      </div>

      <div className="space-y-4">
        <H2>Quick setup</H2>
        <CodeBlock label="Onboard">{`nadirclaw openclaw onboard`}</CodeBlock>
        <P>
          This command:
        </P>
        <ul className="space-y-2 text-sm text-muted-foreground">
          <BulletItem>Registers <InlineCode>nadirclaw/auto</InlineCode> as a model provider in OpenClaw.</BulletItem>
          <BulletItem>Uses the same credential store -- OpenClaw keys are detected automatically.</BulletItem>
          <BulletItem>Configures the correct base URL and auth token.</BulletItem>
        </ul>
      </div>

      <div className="space-y-4">
        <H2>Usage</H2>
        <P>
          In an OpenClaw agent session, select the NadirClaw model:
        </P>
        <CodeBlock label="OpenClaw session">{`/model nadirclaw/auto`}</CodeBlock>
      </div>

      <div className="space-y-4">
        <H2>Full setup steps</H2>
        <CodeBlock label="Step by step">{`# 1. Make sure NadirClaw is running
nadirclaw serve

# 2. In a new terminal, run the onboard command
nadirclaw openclaw onboard

# 3. Start an OpenClaw session
openclaw chat

# 4. Select the NadirClaw model
/model nadirclaw/auto

# All requests now route through NadirClaw's classifier`}</CodeBlock>
      </div>
    </div>
  );
}

/* ================================================================== */
/*  9. OTHER TOOLS                                                     */
/* ================================================================== */

export function OtherToolsContent() {
  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <h1 className="text-3xl font-semibold text-foreground">Other Tools</h1>
        <P>
          NadirClaw works with any OpenAI-compatible client. Point the base URL
          to <InlineCode>http://localhost:8856/v1</InlineCode> and set the API
          key to <InlineCode>local</InlineCode>.
        </P>
      </div>

      <div className="space-y-4">
        <H2>Cursor</H2>
        <P>
          In Cursor settings, add an OpenAI-compatible API provider:
        </P>
        <CodeBlock label="Cursor config">{`Base URL: http://localhost:8856/v1
API Key:  local
Model:    auto`}</CodeBlock>
      </div>

      <div className="space-y-4">
        <H2>Codex</H2>
        <CodeBlock label="Onboard">{`nadirclaw codex onboard`}</CodeBlock>
      </div>

      <div className="space-y-4">
        <H2>Continue</H2>
        <CodeBlock label="Onboard">{`nadirclaw continue onboard`}</CodeBlock>
      </div>

      <div className="space-y-4">
        <H2>Open WebUI</H2>
        <P>
          Add NadirClaw as an OpenAI-compatible provider in Open WebUI settings:
        </P>
        <CodeBlock label="Open WebUI">{`Provider URL: http://localhost:8856/v1
API Key:      local`}</CodeBlock>
      </div>

      <div className="space-y-4">
        <H2>Aider</H2>
        <CodeBlock label="Aider">{`export OPENAI_API_BASE=http://localhost:8856/v1
export OPENAI_API_KEY=local
aider`}</CodeBlock>
      </div>

      <div className="space-y-4">
        <H2>Any OpenAI-compatible client</H2>
        <P>
          Any tool that supports the OpenAI API format can use NadirClaw. Just
          configure:
        </P>
        <ul className="space-y-2 text-sm text-muted-foreground">
          <BulletItem>Base URL: <InlineCode>http://localhost:8856/v1</InlineCode></BulletItem>
          <BulletItem>API key: <InlineCode>local</InlineCode> (or your custom <InlineCode>NADIRCLAW_AUTH_TOKEN</InlineCode>)</BulletItem>
          <BulletItem>Model: <InlineCode>auto</InlineCode> (or any specific model name/alias)</BulletItem>
        </ul>
      </div>

      <div className="space-y-4">
        <H2>Ollama integration</H2>
        <P>
          Discover and route to locally running Ollama models:
        </P>
        <CodeBlock label="Ollama">{`nadirclaw ollama discover

# Output:
# Found 3 Ollama models:
#   llama3.2:latest
#   codellama:13b
#   mistral:latest
# Added to NadirClaw model registry.`}</CodeBlock>
      </div>
    </div>
  );
}

/* ================================================================== */
/*  10. DASHBOARD                                                      */
/* ================================================================== */

export function DashboardContent() {
  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <h1 className="text-3xl font-semibold text-foreground">Dashboard & Reports</h1>
        <P>
          NadirClaw provides a web dashboard, a terminal dashboard, and a set
          of CLI commands for viewing usage data and savings.
        </P>
      </div>

      <div className="space-y-4">
        <H2>Video tour</H2>
        <P>
          A 60-second walkthrough of the hosted dashboard: API keys, live
          routing, savings, and logs.
        </P>
        <div
          className="relative rounded-lg overflow-hidden border border-border bg-muted"
          style={{ paddingBottom: "56.25%", height: 0 }}
        >
          <iframe
            src="https://www.tella.tv/video/vid_cmo4ivdrz00e904jpdc6d20yg/embed?b=1&title=1&a=1&loop=0&t=0&muted=0&wt=1&o=1"
            title="Getting Started with the Nadir Dashboard"
            allow="autoplay; fullscreen"
            className="absolute top-0 left-0 w-full h-full border-0"
          />
        </div>
      </div>

      <div className="space-y-4">
        <H2>Web dashboard</H2>
        <P>
          Install the dashboard extra and open it in your browser:
        </P>
        <CodeBlock label="Web dashboard">{`pip install nadirclaw[dashboard]
nadirclaw serve

# Open http://localhost:8856/dashboard`}</CodeBlock>
      </div>

      <div className="space-y-4">
        <H2>Terminal dashboard</H2>
        <P>
          A TUI dashboard that runs directly in your terminal:
        </P>
        <CodeBlock label="Terminal dashboard">{`nadirclaw dashboard`}</CodeBlock>
      </div>

      <div className="space-y-4">
        <H2>Reports</H2>
        <CodeBlock label="Generate reports">{`# Usage report for the last 7 days, grouped by model and day
nadirclaw report --since 7d --by-model --by-day

# Output:
# Date        Model                    Requests  Tokens    Cost
# 2026-03-25  gemini-2.0-flash         142       84,210    $0.42
# 2026-03-25  claude-sonnet-4-20250514  38       62,400    $3.12
# ...`}</CodeBlock>
      </div>

      <div className="space-y-4">
        <H2>Savings</H2>
        <CodeBlock label="Savings summary">{`nadirclaw savings

# Output:
# Total requests:      1,247
# Routed to simple:    891 (71.4%)
# Estimated savings:   $48.20 (vs. all-premium routing)
# Avg cost/request:    $0.0031`}</CodeBlock>
      </div>

      <div className="space-y-4">
        <H2>Export</H2>
        <CodeBlock label="Export data">{`nadirclaw export --format csv --since 7d`}</CodeBlock>
      </div>

      <div className="space-y-4">
        <H2>Cache stats</H2>
        <CodeBlock label="Cache">{`nadirclaw cache

# Output:
# Cache entries:  312
# Hit rate:       24.7%
# Memory usage:   18.4 MB
# TTL:            3600s`}</CodeBlock>
      </div>
    </div>
  );
}

/* ================================================================== */
/*  11. PROMETHEUS                                                     */
/* ================================================================== */

export function PrometheusContent() {
  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <h1 className="text-3xl font-semibold text-foreground">Prometheus & Telemetry</h1>
        <P>
          NadirClaw exposes a Prometheus-compatible metrics endpoint and
          supports OpenTelemetry for distributed tracing.
        </P>
      </div>

      <div className="space-y-4">
        <H2>Prometheus endpoint</H2>
        <P>
          Metrics are available at{" "}
          <InlineCode>http://localhost:8856/metrics</InlineCode> when the
          telemetry extra is installed.
        </P>
        <CodeBlock label="Install">{`pip install nadirclaw[telemetry]`}</CodeBlock>
      </div>

      <div className="space-y-4">
        <H2>Available metrics</H2>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left px-4 py-3 font-semibold text-foreground">Metric</th>
                <th className="text-left px-4 py-3 font-semibold text-foreground">Type</th>
                <th className="text-left px-4 py-3 font-semibold text-foreground">Description</th>
              </tr>
            </thead>
            <tbody className="text-muted-foreground">
              <tr className="border-b border-border">
                <td className="px-4 py-3"><InlineCode>nadirclaw_requests_total</InlineCode></td>
                <td className="px-4 py-3">counter</td>
                <td className="px-4 py-3">Total requests processed</td>
              </tr>
              <tr className="border-b border-border">
                <td className="px-4 py-3"><InlineCode>nadirclaw_tokens_prompt_total</InlineCode></td>
                <td className="px-4 py-3">counter</td>
                <td className="px-4 py-3">Total prompt tokens</td>
              </tr>
              <tr className="border-b border-border">
                <td className="px-4 py-3"><InlineCode>nadirclaw_tokens_completion_total</InlineCode></td>
                <td className="px-4 py-3">counter</td>
                <td className="px-4 py-3">Total completion tokens</td>
              </tr>
              <tr className="border-b border-border">
                <td className="px-4 py-3"><InlineCode>nadirclaw_cost_dollars_total</InlineCode></td>
                <td className="px-4 py-3">counter</td>
                <td className="px-4 py-3">Total cost in USD</td>
              </tr>
              <tr className="border-b border-border">
                <td className="px-4 py-3"><InlineCode>nadirclaw_request_latency_ms</InlineCode></td>
                <td className="px-4 py-3">histogram</td>
                <td className="px-4 py-3">Request latency in milliseconds</td>
              </tr>
              <tr className="border-b border-border">
                <td className="px-4 py-3"><InlineCode>nadirclaw_cache_hits_total</InlineCode></td>
                <td className="px-4 py-3">counter</td>
                <td className="px-4 py-3">Total cache hits</td>
              </tr>
              <tr className="border-b border-border">
                <td className="px-4 py-3"><InlineCode>nadirclaw_fallbacks_total</InlineCode></td>
                <td className="px-4 py-3">counter</td>
                <td className="px-4 py-3">Total fallback events</td>
              </tr>
              <tr className="border-b border-border">
                <td className="px-4 py-3"><InlineCode>nadirclaw_errors_total</InlineCode></td>
                <td className="px-4 py-3">counter</td>
                <td className="px-4 py-3">Total errors</td>
              </tr>
              <tr>
                <td className="px-4 py-3"><InlineCode>nadirclaw_uptime_seconds</InlineCode></td>
                <td className="px-4 py-3">gauge</td>
                <td className="px-4 py-3">Server uptime in seconds</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-4">
        <H2>OpenTelemetry</H2>
        <P>
          Export traces to any OTLP-compatible backend:
        </P>
        <CodeBlock label="~/.nadirclaw/.env">{`OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317`}</CodeBlock>
      </div>

      <div className="space-y-4">
        <H2>Grafana dashboard</H2>
        <P>
          Example Grafana dashboard provisioning config for NadirClaw metrics:
        </P>
        <CodeBlock label="grafana-dashboard.json">{`{
  "dashboard": {
    "title": "NadirClaw",
    "panels": [
      {
        "title": "Requests / min",
        "type": "graph",
        "targets": [
          { "expr": "rate(nadirclaw_requests_total[1m])" }
        ]
      },
      {
        "title": "Cost / hour",
        "type": "stat",
        "targets": [
          { "expr": "increase(nadirclaw_cost_dollars_total[1h])" }
        ]
      },
      {
        "title": "Latency p95",
        "type": "graph",
        "targets": [
          { "expr": "histogram_quantile(0.95, rate(nadirclaw_request_latency_ms_bucket[5m]))" }
        ]
      },
      {
        "title": "Cache hit rate",
        "type": "gauge",
        "targets": [
          { "expr": "rate(nadirclaw_cache_hits_total[5m]) / rate(nadirclaw_requests_total[5m])" }
        ]
      }
    ]
  }
}`}</CodeBlock>
      </div>
    </div>
  );
}

/* ================================================================== */
/*  12. CLI COMMANDS                                                   */
/* ================================================================== */

export function CliCommandsContent() {
  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <h1 className="text-3xl font-semibold text-foreground">CLI Reference</h1>
        <P>
          Complete reference for all NadirClaw CLI commands.
        </P>
      </div>

      <div className="space-y-4">
        <H2>Core commands</H2>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left px-4 py-3 font-semibold text-foreground">Command</th>
                <th className="text-left px-4 py-3 font-semibold text-foreground">Description</th>
              </tr>
            </thead>
            <tbody className="text-muted-foreground">
              <tr className="border-b border-border">
                <td className="px-4 py-3"><InlineCode>nadirclaw setup</InlineCode></td>
                <td className="px-4 py-3">Interactive setup wizard for provider keys and model selection</td>
              </tr>
              <tr className="border-b border-border">
                <td className="px-4 py-3"><InlineCode>nadirclaw serve</InlineCode></td>
                <td className="px-4 py-3">Start the local router server</td>
              </tr>
              <tr className="border-b border-border">
                <td className="px-4 py-3"><InlineCode>nadirclaw status</InlineCode></td>
                <td className="px-4 py-3">Show server status and configuration</td>
              </tr>
              <tr>
                <td className="px-4 py-3"><InlineCode>nadirclaw test</InlineCode></td>
                <td className="px-4 py-3">Send a test request to verify the router is working</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-4">
        <H2>Routing & optimization</H2>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left px-4 py-3 font-semibold text-foreground">Command</th>
                <th className="text-left px-4 py-3 font-semibold text-foreground">Description</th>
              </tr>
            </thead>
            <tbody className="text-muted-foreground">
              <tr className="border-b border-border">
                <td className="px-4 py-3"><InlineCode>nadirclaw classify "prompt"</InlineCode></td>
                <td className="px-4 py-3">Classify a prompt without making an LLM call</td>
              </tr>
              <tr>
                <td className="px-4 py-3"><InlineCode>nadirclaw optimize file.json</InlineCode></td>
                <td className="px-4 py-3">Preview context optimization on a saved payload</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-4">
        <H2>Analytics & reporting</H2>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left px-4 py-3 font-semibold text-foreground">Command</th>
                <th className="text-left px-4 py-3 font-semibold text-foreground">Description</th>
              </tr>
            </thead>
            <tbody className="text-muted-foreground">
              <tr className="border-b border-border">
                <td className="px-4 py-3"><InlineCode>nadirclaw report</InlineCode></td>
                <td className="px-4 py-3">Generate usage reports (supports --since, --by-model, --by-day)</td>
              </tr>
              <tr className="border-b border-border">
                <td className="px-4 py-3"><InlineCode>nadirclaw savings</InlineCode></td>
                <td className="px-4 py-3">Show estimated cost savings from smart routing</td>
              </tr>
              <tr className="border-b border-border">
                <td className="px-4 py-3"><InlineCode>nadirclaw dashboard</InlineCode></td>
                <td className="px-4 py-3">Open the terminal dashboard (TUI)</td>
              </tr>
              <tr className="border-b border-border">
                <td className="px-4 py-3"><InlineCode>nadirclaw export</InlineCode></td>
                <td className="px-4 py-3">Export usage data (supports --format csv/json, --since)</td>
              </tr>
              <tr className="border-b border-border">
                <td className="px-4 py-3"><InlineCode>nadirclaw cache</InlineCode></td>
                <td className="px-4 py-3">Show cache statistics</td>
              </tr>
              <tr>
                <td className="px-4 py-3"><InlineCode>nadirclaw budget</InlineCode></td>
                <td className="px-4 py-3">Show current budget status and spend</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-4">
        <H2>Authentication</H2>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left px-4 py-3 font-semibold text-foreground">Command</th>
                <th className="text-left px-4 py-3 font-semibold text-foreground">Description</th>
              </tr>
            </thead>
            <tbody className="text-muted-foreground">
              <tr className="border-b border-border">
                <td className="px-4 py-3"><InlineCode>nadirclaw auth add</InlineCode></td>
                <td className="px-4 py-3">Add a provider API key</td>
              </tr>
              <tr className="border-b border-border">
                <td className="px-4 py-3"><InlineCode>nadirclaw auth remove</InlineCode></td>
                <td className="px-4 py-3">Remove a provider API key</td>
              </tr>
              <tr className="border-b border-border">
                <td className="px-4 py-3"><InlineCode>nadirclaw auth status</InlineCode></td>
                <td className="px-4 py-3">Show which provider keys are configured</td>
              </tr>
              <tr className="border-b border-border">
                <td className="px-4 py-3"><InlineCode>nadirclaw auth login</InlineCode></td>
                <td className="px-4 py-3">Log in to Nadir Pro (if applicable)</td>
              </tr>
              <tr>
                <td className="px-4 py-3"><InlineCode>nadirclaw auth logout</InlineCode></td>
                <td className="px-4 py-3">Log out of Nadir Pro</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-4">
        <H2>Tool integrations</H2>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left px-4 py-3 font-semibold text-foreground">Command</th>
                <th className="text-left px-4 py-3 font-semibold text-foreground">Description</th>
              </tr>
            </thead>
            <tbody className="text-muted-foreground">
              <tr className="border-b border-border">
                <td className="px-4 py-3"><InlineCode>nadirclaw openclaw onboard</InlineCode></td>
                <td className="px-4 py-3">Configure OpenClaw to use NadirClaw</td>
              </tr>
              <tr className="border-b border-border">
                <td className="px-4 py-3"><InlineCode>nadirclaw codex onboard</InlineCode></td>
                <td className="px-4 py-3">Configure Codex to use NadirClaw</td>
              </tr>
              <tr className="border-b border-border">
                <td className="px-4 py-3"><InlineCode>nadirclaw continue onboard</InlineCode></td>
                <td className="px-4 py-3">Configure Continue to use NadirClaw</td>
              </tr>
              <tr>
                <td className="px-4 py-3"><InlineCode>nadirclaw ollama discover</InlineCode></td>
                <td className="px-4 py-3">Discover and register local Ollama models</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-4">
        <H2>Advanced</H2>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left px-4 py-3 font-semibold text-foreground">Command</th>
                <th className="text-left px-4 py-3 font-semibold text-foreground">Description</th>
              </tr>
            </thead>
            <tbody className="text-muted-foreground">
              <tr className="border-b border-border">
                <td className="px-4 py-3"><InlineCode>nadirclaw build-centroids</InlineCode></td>
                <td className="px-4 py-3">Build classifier centroids from training data</td>
              </tr>
              <tr>
                <td className="px-4 py-3"><InlineCode>nadirclaw train</InlineCode></td>
                <td className="px-4 py-3">Train a custom classifier on your usage data</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ================================================================== */
/*  13. PRO FEATURES                                                   */
/* ================================================================== */

export function ProFeaturesContent() {
  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <h1 className="text-3xl font-semibold text-foreground">Nadir Pro</h1>
        <P>
          NadirClaw is free and open source forever. Nadir Pro adds a managed
          hosted layer on top for teams who want zero-setup infrastructure and
          advanced features.
        </P>
      </div>

      <div className="space-y-4">
        <H2>Pro features</H2>
        <div className="grid gap-4 sm:grid-cols-2">
          <FeatureCard
            title="Hosted proxy"
            desc="No self-hosting required. Point your tools to api.getnadir.com and skip the local server entirely."
          />
          <FeatureCard
            title="Team dashboard"
            desc="Web UI with analytics, cost tracking, and per-member usage breakdowns for your entire team."
          />
          <FeatureCard
            title="ML-powered routing"
            desc="Advanced Two-Tower neural network and ensemble classifiers that go beyond the sentence-embedding binary classifier."
          />
          <FeatureCard
            title="Provider health monitoring"
            desc="Real-time health scores per provider with auto-ranking. Unhealthy providers are automatically deprioritized."
          />
          <FeatureCard
            title="Response healing"
            desc="Auto-fix malformed JSON when structured output is requested. Detects and repairs broken responses before they reach your app."
          />
          <FeatureCard
            title="Prompt clustering"
            desc="Group similar prompts for cost analysis and optimization insights. Identify patterns and reduce redundant calls."
          />
        </div>
      </div>

      <div className="space-y-4">
        <H2>Enterprise features</H2>
        <div className="grid gap-4 sm:grid-cols-2">
          <FeatureCard
            title="Model distillation"
            desc="Train specialized models from your usage patterns. Create smaller, faster models that replicate your most common workflows."
          />
          <FeatureCard
            title="SSO & audit logs"
            desc="Enterprise authentication with SAML/OIDC SSO and comprehensive audit logs for compliance."
          />
        </div>
      </div>

      <div className="space-y-4">
        <H2>Pricing</H2>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left px-4 py-3 font-semibold text-foreground">Plan</th>
                <th className="text-left px-4 py-3 font-semibold text-foreground">Price</th>
                <th className="text-left px-4 py-3 font-semibold text-foreground">Details</th>
              </tr>
            </thead>
            <tbody className="text-muted-foreground">
              <tr className="border-b border-border">
                <td className="px-4 py-3 font-semibold text-foreground">Self-Host</td>
                <td className="px-4 py-3">Free forever</td>
                <td className="px-4 py-3">Full CLI router, smart routing, context optimize, fallbacks, local dashboard (MIT licensed)</td>
              </tr>
              <tr className="border-b border-border">
                <td className="px-4 py-3 font-semibold text-foreground">Free (Hosted)</td>
                <td className="px-4 py-3">Free</td>
                <td className="px-4 py-3">Hosted proxy, 15 requests/day (BYOK only), web dashboard, intelligent routing</td>
              </tr>
              <tr className="border-b border-border">
                <td className="px-4 py-3 font-semibold text-foreground">Pro</td>
                <td className="px-4 py-3">$9/mo + up to 25% of savings</td>
                <td className="px-4 py-3">Unlimited requests, hosted keys or BYOK, semantic cache, fallback chains, context optimization</td>
              </tr>
              <tr>
                <td className="px-4 py-3 font-semibold text-foreground">Enterprise</td>
                <td className="px-4 py-3">Custom</td>
                <td className="px-4 py-3">Model distillation, SSO, audit logs, dedicated support</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <Callout type="info">
        Interested in Nadir Pro? Check the{" "}
        <a href="/pricing" className="text-primary underline underline-offset-2">
          pricing page
        </a>{" "}
        or{" "}
        <a href="/auth?mode=signup" className="text-primary underline underline-offset-2">
          sign up
        </a>{" "}
        to get started.
      </Callout>
    </div>
  );
}

/* ================================================================== */
/*  PYTHON SDK                                                         */
/* ================================================================== */

export function SdkPythonContent() {
  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <h1 className="text-3xl font-semibold text-foreground">Python SDK</h1>
        <P>
          Official Python client for the Nadir LLM router. Provides typed access
          to routing metadata, model recommendations, and all Nadir features
          beyond what the OpenAI SDK offers.
        </P>
      </div>

      <div className="space-y-4">
        <H2>Installation</H2>
        <CodeBlock label="pip">{`pip install nadir-sdk`}</CodeBlock>
      </div>

      <div className="space-y-4">
        <H2>Quick Start</H2>
        <CodeBlock label="Python">{`from nadir import NadirClient

client = NadirClient(api_key="ndr_...")

# Chat completion — Nadir picks the optimal model
response = client.chat.completions.create(
    messages=[{"role": "user", "content": "What is 2+2?"}],
)
print(response.choices[0].message.content)

# See which model was selected and why
print(response.nadir_metadata.tier)             # "simple"
print(response.nadir_metadata.selected_model)   # "gpt-4o-mini"
print(response.nadir_metadata.complexity_score)  # 0.12`}</CodeBlock>
      </div>

      <div className="space-y-4">
        <H2>Streaming</H2>
        <CodeBlock label="Streaming">{`stream = client.chat.completions.create(
    messages=[{"role": "user", "content": "Tell me a story"}],
    stream=True,
)
for chunk in stream:
    print(chunk.choices[0].delta.content or "", end="", flush=True)`}</CodeBlock>
      </div>

      <div className="space-y-4">
        <H2>Model Recommendation (no LLM call)</H2>
        <P>
          Get a routing recommendation without making an LLM call. Useful for
          previewing which model Nadir would select.
        </P>
        <CodeBlock label="Recommend">{`rec = client.recommend("Explain quantum entanglement in detail")
print(rec)  # {"recommended_model": "claude-sonnet-4-20250514", "complexity": ...}`}</CodeBlock>
      </div>

      <div className="space-y-4">
        <H2>Async</H2>
        <CodeBlock label="Async">{`import asyncio
from nadir import AsyncNadirClient

async def main():
    async with AsyncNadirClient(api_key="ndr_...") as client:
        response = await client.chat.completions.create(
            messages=[{"role": "user", "content": "Hello!"}],
        )
        print(response.choices[0].message.content)

asyncio.run(main())`}</CodeBlock>
      </div>

      <div className="space-y-4">
        <H2>Fallback &amp; Routing Control</H2>
        <CodeBlock label="Advanced">{`response = client.chat.completions.create(
    messages=[{"role": "user", "content": "Complex analysis..."}],
    route="fallback",                          # enable auto-fallback
    fallback_models=["claude-sonnet-4-20250514", "gpt-4o"],  # explicit fallback chain
    layers={"routing": True, "optimize": True},  # per-request feature toggles
    reasoning={"effort": "high"},              # reasoning token support
)`}</CodeBlock>
      </div>

      <div className="space-y-4">
        <H2>Environment Variables</H2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border border-border rounded-lg overflow-hidden">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left p-3 font-medium text-foreground border-b border-border">Variable</th>
                <th className="text-left p-3 font-medium text-foreground border-b border-border">Description</th>
                <th className="text-left p-3 font-medium text-foreground border-b border-border">Default</th>
              </tr>
            </thead>
            <tbody className="text-muted-foreground">
              <tr className="border-b border-border">
                <td className="p-3"><InlineCode>NADIR_API_KEY</InlineCode></td>
                <td className="p-3">API key (fallback if not passed to constructor)</td>
                <td className="p-3">-</td>
              </tr>
              <tr>
                <td className="p-3"><InlineCode>NADIR_BASE_URL</InlineCode></td>
                <td className="p-3">API base URL</td>
                <td className="p-3"><InlineCode>https://api.getnadir.dev</InlineCode></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-4">
        <H2>OpenAI Drop-in Compatibility</H2>
        <P>
          Nadir's API is OpenAI-compatible. You can also use the OpenAI SDK
          directly. The Nadir SDK adds typed routing metadata, recommendations,
          and clustering that the OpenAI SDK can't reach.
        </P>
        <CodeBlock label="OpenAI SDK">{`from openai import OpenAI

client = OpenAI(
    base_url="https://api.getnadir.dev/v1",
    api_key="ndr_...",
)
response = client.chat.completions.create(
    model="auto",
    messages=[{"role": "user", "content": "Hello"}],
)`}</CodeBlock>
      </div>

      <Callout type="info">
        Source code and issues:{" "}
        <a
          href="https://github.com/NadirRouter/nadir-python"
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline underline-offset-2"
        >
          github.com/NadirRouter/nadir-python
        </a>
      </Callout>
    </div>
  );
}

/* ================================================================== */
/*  NODE.JS SDK                                                        */
/* ================================================================== */

export function SdkNodeContent() {
  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <h1 className="text-3xl font-semibold text-foreground">Node.js SDK</h1>
        <P>
          Official Node.js/TypeScript client for the Nadir LLM router. Zero
          runtime dependencies, native <InlineCode>fetch</InlineCode>, and full
          TypeScript types.
        </P>
      </div>

      <div className="space-y-4">
        <H2>Installation</H2>
        <CodeBlock label="npm">{`npm install nadir-sdk`}</CodeBlock>
      </div>

      <div className="space-y-4">
        <H2>Quick Start</H2>
        <CodeBlock label="TypeScript">{`import { NadirClient } from "nadir-sdk";

const client = new NadirClient({ apiKey: "ndr_..." });

// Chat completion — Nadir picks the optimal model
const response = await client.chat.completions.create({
  messages: [{ role: "user", content: "What is 2+2?" }],
});
console.log(response.choices[0].message?.content);

// See which model was selected and why
console.log(response.nadir_metadata?.tier);             // "simple"
console.log(response.nadir_metadata?.selected_model);   // "gpt-4o-mini"
console.log(response.nadir_metadata?.complexity_score);  // 0.12`}</CodeBlock>
      </div>

      <div className="space-y-4">
        <H2>Streaming</H2>
        <CodeBlock label="Streaming">{`const stream = await client.chat.completions.create({
  messages: [{ role: "user", content: "Tell me a story" }],
  stream: true,
});

for await (const chunk of stream) {
  process.stdout.write(chunk.choices[0]?.delta?.content ?? "");
}`}</CodeBlock>
      </div>

      <div className="space-y-4">
        <H2>Model Recommendation (no LLM call)</H2>
        <P>
          Get a routing recommendation without making an LLM call.
        </P>
        <CodeBlock label="Recommend">{`const rec = await client.recommend({
  prompt: "Explain quantum entanglement in detail",
});
console.log(rec);`}</CodeBlock>
      </div>

      <div className="space-y-4">
        <H2>Fallback &amp; Routing Control</H2>
        <CodeBlock label="Advanced">{`const response = await client.chat.completions.create({
  messages: [{ role: "user", content: "Complex analysis..." }],
  route: "fallback",                              // enable auto-fallback
  fallback_models: ["claude-sonnet-4-20250514", "gpt-4o"],  // explicit fallback chain
  layers: { routing: true, optimize: true },        // per-request feature toggles
  reasoning: { effort: "high" },                   // reasoning token support
});`}</CodeBlock>
      </div>

      <div className="space-y-4">
        <H2>Environment Variables</H2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border border-border rounded-lg overflow-hidden">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left p-3 font-medium text-foreground border-b border-border">Variable</th>
                <th className="text-left p-3 font-medium text-foreground border-b border-border">Description</th>
                <th className="text-left p-3 font-medium text-foreground border-b border-border">Default</th>
              </tr>
            </thead>
            <tbody className="text-muted-foreground">
              <tr className="border-b border-border">
                <td className="p-3"><InlineCode>NADIR_API_KEY</InlineCode></td>
                <td className="p-3">API key (fallback if not passed to constructor)</td>
                <td className="p-3">-</td>
              </tr>
              <tr>
                <td className="p-3"><InlineCode>NADIR_BASE_URL</InlineCode></td>
                <td className="p-3">API base URL</td>
                <td className="p-3"><InlineCode>https://api.getnadir.dev</InlineCode></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-4">
        <H2>OpenAI Drop-in Compatibility</H2>
        <P>
          Nadir's API is OpenAI-compatible. The Nadir SDK adds typed routing
          metadata, recommendations, and clustering on top.
        </P>
        <CodeBlock label="OpenAI SDK">{`import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "https://api.getnadir.dev/v1",
  apiKey: "ndr_...",
});

const response = await client.chat.completions.create({
  model: "auto",
  messages: [{ role: "user", content: "Hello" }],
});`}</CodeBlock>
      </div>

      <Callout type="info">
        Requires Node.js 18+ (native fetch). Source code and issues:{" "}
        <a
          href="https://github.com/NadirRouter/nadir-node"
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline underline-offset-2"
        >
          github.com/NadirRouter/nadir-node
        </a>
      </Callout>
    </div>
  );
}

/* ================================================================== */
/*  Content map                                                        */
/* ================================================================== */

export const docsContentMap: Record<string, () => JSX.Element> = {
  quickstart: QuickstartContent,
  "self-host": SelfHostContent,
  installation: InstallationContent,
  configuration: ConfigurationContent,
  "smart-routing": SmartRoutingContent,
  "context-optimize": ContextOptimizeContent,
  fallbacks: FallbacksContent,
  "claude-code": ClaudeCodeContent,
  openclaw: OpenClawContent,
  "other-tools": OtherToolsContent,
  dashboard: DashboardContent,
  prometheus: PrometheusContent,
  "cli-commands": CliCommandsContent,
  "sdk-python": SdkPythonContent,
  "sdk-node": SdkNodeContent,
  "pro-features": ProFeaturesContent,
};
