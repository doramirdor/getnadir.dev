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
/*  1. QUICKSTART                                                      */
/* ================================================================== */

export function QuickstartContent() {
  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <h1 className="text-3xl font-semibold text-foreground">Quick Start</h1>
        <P>
          Nadir is an OpenAI-compatible LLM gateway that automatically routes
          each request to the best model for the job. Get started in under a
          minute — just swap your base URL and add your API key.
        </P>
      </div>

      <div className="space-y-4">
        <H2>1. Get your API key</H2>
        <P>
          Sign up at the dashboard, navigate to <strong className="text-foreground">API Keys</strong>,
          and create a new key. Copy it — you won't be able to see it again.
        </P>
      </div>

      <div className="space-y-4">
        <H2>2. Make your first request</H2>
        <P>
          Replace your OpenAI base URL with Nadir's endpoint. All existing
          OpenAI SDK code works without modification.
        </P>

        <CodeTabs
          examples={[
            {
              label: "Python",
              language: "python",
              code: `import openai

client = openai.OpenAI(
    base_url="https://api.nadir.dev/v1",
    api_key="YOUR_NADIR_API_KEY",
)

response = client.chat.completions.create(
    messages=[{"role": "user", "content": "Explain quantum computing"}],
    model="auto",  # let Nadir choose the best model
)

print(response.choices[0].message.content)`,
            },
            {
              label: "cURL",
              language: "curl",
              code: `curl https://api.nadir.dev/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: YOUR_NADIR_API_KEY" \\
  -d '{
    "messages": [
      {"role": "user", "content": "Explain quantum computing"}
    ],
    "model": "auto"
  }'`,
            },
            {
              label: "JavaScript",
              language: "javascript",
              code: `const response = await fetch("https://api.nadir.dev/v1/chat/completions", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-API-Key": "YOUR_NADIR_API_KEY",
  },
  body: JSON.stringify({
    messages: [{ role: "user", content: "Explain quantum computing" }],
    model: "auto",
  }),
});

const data = await response.json();
console.log(data.choices[0].message.content);`,
            },
          ]}
        />
      </div>

      <div className="space-y-4">
        <H2>3. Understand the response</H2>
        <P>
          Responses follow the OpenAI format with an additional{" "}
          <InlineCode>nadir_metadata</InlineCode> field showing routing
          decisions, latency, and cost.
        </P>

        <CodeBlock label="Example response">{`{
  "id": "nadir-a1b2c3d4",
  "object": "chat.completion",
  "model": "gpt-4o-mini",
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
  "nadir_metadata": {
    "complexity_tier": "simple",
    "routed_by": "smart-routing",
    "latency_ms": 420,
    "cost_usd": 0.00012
  }
}`}</CodeBlock>
      </div>

      <Callout type="tip">
        Set <InlineCode>model</InlineCode> to <InlineCode>"auto"</InlineCode> (or
        omit it) to let Nadir's ML classifier pick the most cost-effective model.
        Or specify a model name like <InlineCode>"gpt-4o"</InlineCode> to pin the
        request.
      </Callout>
    </div>
  );
}

/* ================================================================== */
/*  2. AUTHENTICATION                                                  */
/* ================================================================== */

export function AuthenticationContent() {
  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <h1 className="text-3xl font-semibold text-foreground">Authentication</h1>
        <P>
          Every request to Nadir must include a valid API key in the{" "}
          <InlineCode>X-API-Key</InlineCode> header. You can also use the
          standard <InlineCode>Authorization: Bearer</InlineCode> header.
        </P>
      </div>

      <div className="space-y-4">
        <H2>Creating API keys</H2>
        <P>
          Navigate to <strong className="text-foreground">API Keys</strong> in
          the dashboard. Click <strong className="text-foreground">Create Key</strong>,
          give it a name, and optionally link it to a preset.
        </P>

        <div className="rounded-lg border border-border p-5 space-y-3">
          <h3 className="font-semibold text-foreground text-sm">Key features</h3>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <BulletItem>Keys are hashed before storage — they cannot be retrieved after creation.</BulletItem>
            <BulletItem>Each key can be linked to a preset for automatic routing configuration.</BulletItem>
            <BulletItem>Keys can be scoped to specific organizations for team management.</BulletItem>
            <BulletItem>Revoke a key instantly from the dashboard if compromised.</BulletItem>
          </ul>
        </div>
      </div>

      <div className="space-y-4">
        <H2>Using your key</H2>
        <CodeTabs
          examples={[
            {
              label: "Python",
              language: "python",
              code: `import openai

# Option 1: OpenAI SDK (uses Authorization header internally)
client = openai.OpenAI(
    base_url="https://api.nadir.dev/v1",
    api_key="YOUR_NADIR_API_KEY",
)

# Option 2: Raw request with X-API-Key
import requests

response = requests.post(
    "https://api.nadir.dev/v1/chat/completions",
    headers={"X-API-Key": "YOUR_NADIR_API_KEY"},
    json={"messages": [{"role": "user", "content": "Hello"}]},
)`,
            },
            {
              label: "cURL",
              language: "curl",
              code: `# Using X-API-Key header
curl https://api.nadir.dev/v1/chat/completions \\
  -H "X-API-Key: YOUR_NADIR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"messages": [{"role": "user", "content": "Hello"}]}'

# Or using Bearer token
curl https://api.nadir.dev/v1/chat/completions \\
  -H "Authorization: Bearer YOUR_NADIR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"messages": [{"role": "user", "content": "Hello"}]}'`,
            },
            {
              label: "JavaScript",
              language: "javascript",
              code: `// Using X-API-Key header
const response = await fetch("https://api.nadir.dev/v1/chat/completions", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-API-Key": "YOUR_NADIR_API_KEY",
  },
  body: JSON.stringify({
    messages: [{ role: "user", content: "Hello" }],
  }),
});`,
            },
          ]}
        />
      </div>

      <Callout type="warning">
        Never expose your API key in client-side code or public repositories.
        Use environment variables or a backend proxy to keep keys secure.
      </Callout>
    </div>
  );
}

/* ================================================================== */
/*  3. MODELS & PROVIDERS                                              */
/* ================================================================== */

export function ModelsContent() {
  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <h1 className="text-3xl font-semibold text-foreground">
          Models & Providers
        </h1>
        <P>
          Nadir supports models from all major LLM providers through a unified
          API. Use <InlineCode>"auto"</InlineCode> for intelligent routing, or
          specify any model name directly.
        </P>
      </div>

      <div className="space-y-4">
        <H2>Supported providers</H2>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left px-4 py-3 font-semibold text-foreground">Provider</th>
                <th className="text-left px-4 py-3 font-semibold text-foreground">Models</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {[
                ["OpenAI", "gpt-4o, gpt-4o-mini, gpt-4-turbo, o1, o1-mini, o3-mini"],
                ["Anthropic", "claude-3.5-sonnet, claude-3-opus, claude-3-sonnet, claude-3-haiku"],
                ["Google", "gemini-2.0-flash, gemini-1.5-pro, gemini-1.5-flash"],
                ["DeepSeek", "deepseek-chat, deepseek-reasoner"],
                ["xAI", "grok-2, grok-2-mini"],
                ["Meta (via Together/Replicate)", "llama-3.3-70b, llama-3.1-405b, llama-3-8b"],
                ["Mistral", "mistral-large, mistral-medium, mistral-small, codestral"],
                ["Cohere", "command-r-plus, command-r"],
                ["AWS Bedrock", "All Bedrock-hosted models via your own credentials"],
              ].map(([provider, models]) => (
                <tr key={provider}>
                  <td className="px-4 py-3 font-medium text-foreground whitespace-nowrap">
                    {provider}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{models}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-4">
        <H2>Listing available models</H2>
        <P>
          Use the models endpoint to get the full list of models available for
          your account, including any BYOK (Bring Your Own Key) models.
        </P>

        <CodeTabs
          examples={[
            {
              label: "Python",
              language: "python",
              code: `import openai

client = openai.OpenAI(
    base_url="https://api.nadir.dev/v1",
    api_key="YOUR_NADIR_API_KEY",
)

models = client.models.list()
for model in models.data:
    print(model.id)`,
            },
            {
              label: "cURL",
              language: "curl",
              code: `curl https://api.nadir.dev/v1/models \\
  -H "X-API-Key: YOUR_NADIR_API_KEY"`,
            },
            {
              label: "JavaScript",
              language: "javascript",
              code: `const response = await fetch("https://api.nadir.dev/v1/models", {
  headers: { "X-API-Key": "YOUR_NADIR_API_KEY" },
});

const data = await response.json();
data.data.forEach(model => console.log(model.id));`,
            },
          ]}
        />
      </div>

      <div className="space-y-4">
        <H2>BYOK — Bring Your Own Key</H2>
        <P>
          Connect your own API keys from any supported provider via the{" "}
          <strong className="text-foreground">Integrations</strong> page. BYOK
          models are billed directly by the provider — Nadir only charges the
          routing fee.
        </P>
      </div>

      <Callout type="info">
        The models list updates automatically as providers release new models.
        Check the dashboard or the <InlineCode>/v1/models</InlineCode> endpoint
        for the latest availability.
      </Callout>
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
          When you omit the <InlineCode>model</InlineCode> parameter (or set it
          to <InlineCode>"auto"</InlineCode>), Nadir analyzes each prompt's
          complexity and automatically selects the most cost-effective model
          that meets quality requirements.
        </P>
      </div>

      <div className="space-y-4">
        <H2>How it works</H2>
        <div className="grid gap-4 sm:grid-cols-2">
          <FeatureCard
            title="1. Complexity Analysis"
            desc="An ML classifier (Two-Tower neural network) scores every prompt on dimensions like reasoning depth, domain specificity, and instruction complexity."
          />
          <FeatureCard
            title="2. Tier Assignment"
            desc="The prompt is assigned a complexity tier — simple, moderate, complex, or expert — which determines the model pool."
          />
          <FeatureCard
            title="3. Model Ranking"
            desc="Eligible models are ranked by capability-vs-cost for the detected tier, respecting your preset's allowed models and budget."
          />
          <FeatureCard
            title="4. Selection & Dispatch"
            desc="The top-ranked model is selected. If it fails, Nadir automatically retries with the next-ranked model."
          />
        </div>
      </div>

      <div className="space-y-4">
        <H2>Complexity tiers</H2>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left px-4 py-3 font-semibold text-foreground">Tier</th>
                <th className="text-left px-4 py-3 font-semibold text-foreground">Examples</th>
                <th className="text-left px-4 py-3 font-semibold text-foreground">Typical models</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {[
                ["Simple", "Greetings, factual lookups, simple translations", "gpt-4o-mini, gemini-flash, claude-haiku"],
                ["Moderate", "Summarization, content generation, basic analysis", "gpt-4o-mini, deepseek-chat, mistral-small"],
                ["Complex", "Multi-step reasoning, code generation, research", "gpt-4o, claude-sonnet, gemini-pro"],
                ["Expert", "Advanced math, architecture design, nuanced analysis", "claude-opus, gpt-4-turbo, o1"],
              ].map(([tier, examples, models]) => (
                <tr key={tier}>
                  <td className="px-4 py-3 font-medium text-foreground whitespace-nowrap">{tier}</td>
                  <td className="px-4 py-3 text-muted-foreground">{examples}</td>
                  <td className="px-4 py-3 text-muted-foreground">{models}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-4">
        <H2>Overriding smart routing</H2>
        <P>
          You can always pin a specific model by passing its name in the{" "}
          <InlineCode>model</InlineCode> field. Smart routing is only activated
          when model is <InlineCode>"auto"</InlineCode>, <InlineCode>null</InlineCode>,
          or omitted entirely.
        </P>
        <CodeBlock label="Pinning a model">{`{
  "messages": [{"role": "user", "content": "Hello"}],
  "model": "gpt-4o"  // bypasses smart routing
}`}</CodeBlock>
      </div>

      <Callout type="tip">
        Use the <strong>Playground</strong> page in the dashboard to test routing
        decisions before deploying. You can see exactly which model Nadir would
        choose for any prompt.
      </Callout>
    </div>
  );
}

/* ================================================================== */
/*  5. PRESETS                                                         */
/* ================================================================== */

export function PresetsContent() {
  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <h1 className="text-3xl font-semibold text-foreground">Presets</h1>
        <P>
          Presets bundle a system prompt, model whitelist, and default
          parameters into a reusable configuration. Link a preset to an API key
          so every request through that key inherits the settings automatically.
        </P>
      </div>

      <div className="space-y-4">
        <H2>What a preset controls</H2>
        <div className="rounded-lg border border-border p-5 space-y-3">
          <ul className="space-y-2 text-sm text-muted-foreground">
            <BulletItem>
              <strong className="text-foreground">System prompt</strong> — injected
              automatically if the request doesn't include one.
            </BulletItem>
            <BulletItem>
              <strong className="text-foreground">Allowed models</strong> — restricts
              routing to a curated set of models.
            </BulletItem>
            <BulletItem>
              <strong className="text-foreground">Parameter defaults</strong> —
              temperature, max_tokens, top_p, and penalties.
            </BulletItem>
            <BulletItem>
              <strong className="text-foreground">Routing strategy</strong> — smart
              routing, load-balanced, or pinned model.
            </BulletItem>
            <BulletItem>
              <strong className="text-foreground">Budget limits</strong> — per-request
              and monthly cost caps.
            </BulletItem>
          </ul>
        </div>
      </div>

      <div className="space-y-4">
        <H2>Creating a preset</H2>
        <P>
          Go to the <strong className="text-foreground">Presets</strong> page in
          the dashboard. Click <strong className="text-foreground">Create Preset</strong>,
          configure the settings, and save. Then link it to one or more API keys.
        </P>

        <CodeBlock label="Example: preset-linked request">{`# The preset's system prompt, model whitelist, and defaults
# are automatically applied. No extra headers needed.
curl https://api.nadir.dev/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: KEY_LINKED_TO_PRESET" \\
  -d '{
    "messages": [{"role": "user", "content": "Summarize this article..."}]
  }'`}</CodeBlock>
      </div>

      <div className="space-y-4">
        <H2>Request-level overrides</H2>
        <P>
          Parameters included in the request body always override preset
          defaults. For example, if the preset sets{" "}
          <InlineCode>temperature: 0.7</InlineCode> but you pass{" "}
          <InlineCode>temperature: 0.2</InlineCode>, the request uses 0.2.
        </P>
      </div>

      <Callout type="tip">
        Create separate presets for different use cases — one for customer
        support (conservative models, low temperature) and another for creative
        writing (capable models, high temperature).
      </Callout>
    </div>
  );
}

/* ================================================================== */
/*  6. FALLBACKS & LOAD BALANCING                                      */
/* ================================================================== */

export function FallbacksContent() {
  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <h1 className="text-3xl font-semibold text-foreground">
          Fallbacks & Load Balancing
        </h1>
        <P>
          Nadir provides automatic fallback and load balancing across models and
          providers — no client-side retry logic needed.
        </P>
      </div>

      <div className="space-y-4">
        <H2>Automatic fallback</H2>
        <P>
          When a model returns an error (5xx, rate limit, timeout), Nadir
          automatically retries with the next-ranked model for the same
          complexity tier. This happens transparently — the client receives a
          successful response.
        </P>

        <div className="rounded-lg border border-border p-5 space-y-3">
          <H3>Fallback order</H3>
          <ol className="space-y-2 text-sm text-muted-foreground list-decimal list-inside">
            <li>Primary model (selected by smart routing or pinned)</li>
            <li>Next-ranked model in the same complexity tier</li>
            <li>Models from the next tier up (if available)</li>
            <li>Final fallback to a guaranteed-available model</li>
          </ol>
        </div>
      </div>

      <div className="space-y-4">
        <H2>Load balancing strategies</H2>
        <P>
          Configure how traffic is distributed across providers in your preset
          settings.
        </P>

        <div className="grid gap-4 sm:grid-cols-2">
          <FeatureCard
            title="Round Robin"
            desc="Evenly distribute requests across all available providers. Good for spreading rate limits."
          />
          <FeatureCard
            title="Weighted"
            desc="Assign weight percentages to each provider. Use this when you prefer one provider but want overflow."
          />
          <FeatureCard
            title="Latency-Aware"
            desc="Route to the provider with the lowest recent latency. Automatically adapts to real-time performance."
          />
          <FeatureCard
            title="Cost-Optimized"
            desc="Always select the cheapest available option for the detected complexity tier."
          />
        </div>
      </div>

      <div className="space-y-4">
        <H2>Retry behavior</H2>
        <P>
          Nadir retries up to 3 times with exponential backoff. You can see
          fallback events in the <strong className="text-foreground">Logs</strong>{" "}
          page, including which models were attempted and why each failed.
        </P>
      </div>

      <Callout type="info">
        Fallback and load balancing work together. If your load-balanced
        provider fails, the fallback chain activates for the remaining
        providers.
      </Callout>
    </div>
  );
}

/* ================================================================== */
/*  7. PROMPT CLUSTERING                                               */
/* ================================================================== */

export function ClusteringContent() {
  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <h1 className="text-3xl font-semibold text-foreground">
          Prompt Clustering
        </h1>
        <P>
          Upload a CSV of prompts and Nadir automatically discovers semantic
          clusters. Assign routing policies to clusters so similar prompts
          always go to the ideal model.
        </P>
      </div>

      <div className="space-y-4">
        <H2>How it works</H2>
        <ol className="space-y-4 text-sm text-muted-foreground">
          {[
            ["Upload", "Upload a CSV file with a column of prompts from the Clustering page in the dashboard."],
            ["Embed", "Nadir generates sentence-level embeddings for each prompt using a transformer model."],
            ["Cluster", "Prompts are grouped into semantic clusters using hierarchical clustering with cosine similarity."],
            ["Review", "Inspect clusters, rename them, view representative prompts, and merge or split as needed."],
            ["Assign policies", "Set a preferred model, routing strategy, or system prompt per cluster."],
            ["Live classification", "New incoming prompts are automatically matched to the nearest cluster at request time."],
          ].map(([title, desc], i) => (
            <li key={title} className="flex gap-3">
              <span className="flex items-center justify-center h-6 w-6 rounded-full bg-primary/10 text-primary text-xs font-semibold shrink-0">
                {i + 1}
              </span>
              <div>
                <strong className="text-foreground">{title}</strong>
                <span className="ml-1">{desc}</span>
              </div>
            </li>
          ))}
        </ol>
      </div>

      <div className="space-y-4">
        <H2>Classify a prompt</H2>
        <P>
          Use the clustering classify endpoint to see which cluster a prompt
          belongs to — without making an LLM call.
        </P>

        <CodeTabs
          examples={[
            {
              label: "Python",
              language: "python",
              code: `import requests

response = requests.post(
    "https://api.nadir.dev/v1/clustering/classify",
    headers={"X-API-Key": "YOUR_NADIR_API_KEY"},
    json={"prompt": "Write a SQL query to find duplicate rows"},
)

data = response.json()
print(f"Cluster: {data['cluster_name']}")
print(f"Confidence: {data['confidence']}")`,
            },
            {
              label: "cURL",
              language: "curl",
              code: `curl https://api.nadir.dev/v1/clustering/classify \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: YOUR_NADIR_API_KEY" \\
  -d '{"prompt": "Write a SQL query to find duplicate rows"}'`,
            },
            {
              label: "JavaScript",
              language: "javascript",
              code: `const response = await fetch("https://api.nadir.dev/v1/clustering/classify", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-API-Key": "YOUR_NADIR_API_KEY",
  },
  body: JSON.stringify({
    prompt: "Write a SQL query to find duplicate rows",
  }),
});

const data = await response.json();
console.log(\`Cluster: \${data.cluster_name}\`);`,
            },
          ]}
        />
      </div>

      <Callout type="tip">
        Clustering is most effective with at least 50-100 representative
        prompts. The more diverse your sample, the better the cluster
        boundaries.
      </Callout>
    </div>
  );
}

/* ================================================================== */
/*  8. SMART EXPORT                                                    */
/* ================================================================== */

export function SmartExportContent() {
  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <h1 className="text-3xl font-semibold text-foreground">Smart Export</h1>
        <P>
          Smart Export designates an "expert" model for specific use cases.
          When enabled, qualifying requests are always routed to the expert
          model, bypassing the normal complexity analysis.
        </P>
      </div>

      <div className="space-y-4">
        <H2>When to use Smart Export</H2>
        <div className="grid gap-4 sm:grid-cols-2">
          <FeatureCard
            title="Critical workflows"
            desc="Production-critical tasks where you always want the most capable model, regardless of cost."
          />
          <FeatureCard
            title="Domain-specific tasks"
            desc="Tasks where a particular model consistently outperforms others (e.g., Claude for writing, GPT-4 for code)."
          />
          <FeatureCard
            title="Quality assurance"
            desc="Review or validation steps where accuracy matters more than latency or cost."
          />
          <FeatureCard
            title="Benchmarking"
            desc="A/B testing a specific model against smart routing to compare quality and cost."
          />
        </div>
      </div>

      <div className="space-y-4">
        <H2>How it works</H2>
        <P>
          Configure Smart Export from the{" "}
          <strong className="text-foreground">Smart Export</strong> page in the
          dashboard. Select an expert model, define trigger conditions (specific
          clusters, complexity tiers, or manual flag), and activate.
        </P>
        <P>
          Smart Export is checked early in the routing pipeline — before
          complexity analysis and cluster routing. If a request matches the
          Smart Export criteria, it's routed directly to the expert model.
        </P>
      </div>

      <div className="space-y-4">
        <H2>Manual trigger via API</H2>
        <P>
          You can also force Smart Export routing by including the{" "}
          <InlineCode>smart_export</InlineCode> flag in the request body.
        </P>

        <CodeBlock label="Triggering Smart Export">{`{
  "messages": [{"role": "user", "content": "Review this contract..."}],
  "smart_export": true
}`}</CodeBlock>
      </div>

      <Callout type="info">
        Smart Export requests are billed at the expert model's rate. Use it
        selectively to balance quality with cost.
      </Callout>
    </div>
  );
}

/* ================================================================== */
/*  8b. DISTILLATION                                                   */
/* ================================================================== */

export function DistillationContent() {
  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <h1 className="text-3xl font-semibold text-foreground">
          Distillation
        </h1>
        <P>
          Nadir's distillation pipeline uses teacher-student training to create
          specialized, smaller models for your most common prompt clusters.
          The result: faster responses and lower costs for repetitive workloads,
          without sacrificing quality.
        </P>
      </div>

      <div className="space-y-4">
        <H2>How it works</H2>
        <ol className="space-y-4 text-sm text-muted-foreground">
          {[
            [
              "Collect",
              "As requests flow through Nadir, prompt + response pairs from the teacher model (e.g., GPT-4o, Claude Sonnet) are automatically saved per cluster.",
            ],
            [
              "Accumulate",
              "Once a cluster reaches the sample threshold (default: 200), it becomes eligible for distillation training.",
            ],
            [
              "Train",
              "Trigger training manually via the API or dashboard. Choose OpenAI fine-tuning or local LoRA training.",
            ],
            [
              "Quality gate",
              "After training completes, the distilled model is tested against teacher responses using embedding similarity. It must pass the quality threshold before activation.",
            ],
            [
              "Deploy",
              "Once the quality gate passes, incoming requests matching that cluster are automatically routed to the distilled model.",
            ],
            [
              "Monitor",
              "A background monitor runs periodic quality checks. If quality degrades, the model is automatically deactivated and traffic falls back to normal routing.",
            ],
          ].map(([title, desc], i) => (
            <li key={title} className="flex gap-3">
              <span className="flex items-center justify-center h-6 w-6 rounded-full bg-primary/10 text-primary text-xs font-semibold shrink-0">
                {i + 1}
              </span>
              <div>
                <strong className="text-foreground">{title}</strong>
                <span className="ml-1">{desc}</span>
              </div>
            </li>
          ))}
        </ol>
      </div>

      <div className="space-y-4">
        <H2>Training methods</H2>
        <div className="grid gap-4 sm:grid-cols-2">
          <FeatureCard
            title="OpenAI fine-tuning"
            desc="Uses OpenAI's fine-tuning API to create a distilled model hosted on OpenAI's infrastructure. Best for production workloads — no GPU needed."
          />
          <FeatureCard
            title="Local LoRA training"
            desc="Trains a LoRA adapter on a small base model (e.g., Phi-3) locally. Best for privacy-sensitive workloads or when you want full control over the model."
          />
        </div>
      </div>

      <div className="space-y-4">
        <H2>Quality gate</H2>
        <P>
          Distilled models are never activated blindly. After training completes,
          Nadir runs a quality gate:
        </P>
        <div className="rounded-lg border border-border p-5 space-y-3">
          <ul className="space-y-2 text-sm text-muted-foreground">
            <BulletItem>
              Validation prompts are sent to the distilled model.
            </BulletItem>
            <BulletItem>
              Each response is compared to the teacher's response using embedding
              similarity (cosine distance).
            </BulletItem>
            <BulletItem>
              The model must achieve{" "}
              <InlineCode>avg_similarity &gt;= 0.70</InlineCode> and{" "}
              <InlineCode>pass_rate &gt;= 80%</InlineCode> to be activated.
            </BulletItem>
            <BulletItem>
              If the gate fails, the model stays inactive. You can still
              manually activate it from the API if desired.
            </BulletItem>
          </ul>
        </div>
      </div>

      <div className="space-y-4">
        <H2>Triggering training</H2>
        <P>
          Training is manual by default — use the API or dashboard to trigger
          it for a specific cluster. You can also enable auto-training so Nadir
          automatically trains when a cluster reaches the sample threshold.
        </P>

        <CodeTabs
          examples={[
            {
              label: "Python",
              language: "python",
              code: `import requests

response = requests.post(
    "https://api.nadir.dev/v1/distillation/clusters/Basic_SingleFunction/train",
    headers={"X-API-Key": "YOUR_NADIR_API_KEY"},
    json={
        "job_type": "openai",
        "base_model": "gpt-4o-mini-2024-07-18",
        "n_epochs": 3,
        "validation_split": 0.1,
    },
)

job = response.json()
print(f"Job started: {job['job_id']}")
print(f"Samples: {job['training_samples_count']}")`,
            },
            {
              label: "cURL",
              language: "curl",
              code: `curl -X POST https://api.nadir.dev/v1/distillation/clusters/Basic_SingleFunction/train \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: YOUR_NADIR_API_KEY" \\
  -d '{
    "job_type": "openai",
    "base_model": "gpt-4o-mini-2024-07-18",
    "n_epochs": 3,
    "validation_split": 0.1
  }'`,
            },
            {
              label: "JavaScript",
              language: "javascript",
              code: `const response = await fetch(
  "https://api.nadir.dev/v1/distillation/clusters/Basic_SingleFunction/train",
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": "YOUR_NADIR_API_KEY",
    },
    body: JSON.stringify({
      job_type: "openai",
      base_model: "gpt-4o-mini-2024-07-18",
      n_epochs: 3,
      validation_split: 0.1,
    }),
  }
);

const job = await response.json();
console.log(\`Job started: \${job.job_id}\`);`,
            },
          ]}
        />
      </div>

      <div className="space-y-4">
        <H2>Configuration</H2>
        <P>
          Distillation behavior is controlled through environment variables.
          All settings have sensible defaults.
        </P>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left px-4 py-3 font-semibold text-foreground">
                  Setting
                </th>
                <th className="text-left px-4 py-3 font-semibold text-foreground">
                  Default
                </th>
                <th className="text-left px-4 py-3 font-semibold text-foreground">
                  Description
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {[
                ["DISTILLATION_ENABLED", "true", "Enable/disable the distillation pipeline"],
                ["DISTILLATION_MIN_SAMPLES", "200", "Minimum samples before a cluster is eligible"],
                ["DISTILLATION_AUTO_TRAIN", "false", "Auto-trigger training when threshold is met"],
                ["DISTILLATION_QUALITY_THRESHOLD", "0.70", "Minimum embedding similarity to pass quality gate"],
                ["DISTILLATION_PASS_RATE_THRESHOLD", "0.80", "Minimum % of prompts that must pass similarity check"],
                ["DISTILLATION_VALIDATION_SPLIT", "0.1", "Fraction of samples held out for validation"],
              ].map(([setting, def, desc]) => (
                <tr key={setting}>
                  <td className="px-4 py-3 font-mono text-xs text-foreground whitespace-nowrap">
                    {setting}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{def}</td>
                  <td className="px-4 py-3 text-muted-foreground">{desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Callout type="tip">
        Start with manual training on your highest-volume cluster. Once you're
        confident in the quality, enable{" "}
        <InlineCode>DISTILLATION_AUTO_TRAIN</InlineCode> for hands-off
        optimization.
      </Callout>
    </div>
  );
}

/* ================================================================== */
/*  9. ANALYTICS & LOGS                                                */
/* ================================================================== */

export function AnalyticsContent() {
  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <h1 className="text-3xl font-semibold text-foreground">
          Analytics & Logs
        </h1>
        <P>
          Every request is logged with detailed metadata. View real-time
          analytics from the dashboard or query logs programmatically.
        </P>
      </div>

      <div className="space-y-4">
        <H2>Dashboard analytics</H2>
        <div className="grid gap-4 sm:grid-cols-3">
          <FeatureCard
            title="Usage"
            desc="Request volume, token counts, and model distribution over time."
          />
          <FeatureCard
            title="Cost"
            desc="Spend by model, provider, and time period. Compare actual vs. projected cost."
          />
          <FeatureCard
            title="Performance"
            desc="Latency percentiles, error rates, and routing decision breakdowns."
          />
        </div>
      </div>

      <div className="space-y-4">
        <H2>Log fields</H2>
        <P>Each log entry includes:</P>
        <div className="rounded-lg border border-border p-5">
          <div className="divide-y divide-border">
            <Param name="request_id" type="string">Unique request identifier.</Param>
            <Param name="model" type="string">The model that processed the request.</Param>
            <Param name="routed_by" type="string">How the model was selected (smart-routing, preset, pinned, fallback).</Param>
            <Param name="complexity_tier" type="string">Detected complexity (simple, moderate, complex, expert).</Param>
            <Param name="latency_ms" type="number">End-to-end latency in milliseconds.</Param>
            <Param name="cost_usd" type="number">Total cost of the request in USD.</Param>
            <Param name="tokens" type="object">Prompt, completion, and total token counts.</Param>
            <Param name="status" type="string">HTTP status code returned to the client.</Param>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <H2>Fetching logs via API</H2>
        <CodeTabs
          examples={[
            {
              label: "Python",
              language: "python",
              code: `import requests

response = requests.get(
    "https://api.nadir.dev/api/v1/logs",
    headers={"X-API-Key": "YOUR_NADIR_API_KEY"},
    params={"limit": 50, "offset": 0},
)

logs = response.json()
for log in logs["data"]:
    print(f"{log['model']} - {log['latency_ms']}ms - \${log['cost_usd']}")`,
            },
            {
              label: "cURL",
              language: "curl",
              code: `curl "https://api.nadir.dev/api/v1/logs?limit=50" \\
  -H "X-API-Key: YOUR_NADIR_API_KEY"`,
            },
            {
              label: "JavaScript",
              language: "javascript",
              code: `const response = await fetch("https://api.nadir.dev/api/v1/logs?limit=50", {
  headers: { "X-API-Key": "YOUR_NADIR_API_KEY" },
});

const logs = await response.json();
logs.data.forEach(log =>
  console.log(\`\${log.model} - \${log.latency_ms}ms - $\${log.cost_usd}\`)
);`,
            },
          ]}
        />
      </div>

      <Callout type="tip">
        Use the <strong>Analytics</strong> page in the dashboard for visual
        breakdowns. The API is best for programmatic access and custom
        reporting.
      </Callout>
    </div>
  );
}

/* ================================================================== */
/*  10. PLAYGROUND                                                     */
/* ================================================================== */

export function PlaygroundContent() {
  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <h1 className="text-3xl font-semibold text-foreground">Playground</h1>
        <P>
          The Playground is an interactive testing environment in the dashboard
          where you can experiment with prompts, models, and routing
          configurations in real time.
        </P>
      </div>

      <div className="space-y-4">
        <H2>Features</H2>
        <div className="grid gap-4 sm:grid-cols-2">
          <FeatureCard
            title="Live routing preview"
            desc="See exactly which model Nadir would choose for any prompt, without making an LLM call."
          />
          <FeatureCard
            title="Side-by-side comparison"
            desc="Compare responses from different models or presets for the same prompt."
          />
          <FeatureCard
            title="Parameter tuning"
            desc="Adjust temperature, max_tokens, top_p, and other parameters in real time."
          />
          <FeatureCard
            title="Streaming support"
            desc="Test streaming responses to see how they render token by token."
          />
        </div>
      </div>

      <div className="space-y-4">
        <H2>Using the Playground</H2>
        <ol className="space-y-3 text-sm text-muted-foreground list-decimal list-inside">
          <li>Navigate to <strong className="text-foreground">Playground</strong> in the dashboard sidebar.</li>
          <li>Select a model or leave on <strong className="text-foreground">Auto</strong> for smart routing.</li>
          <li>Type your prompt and click <strong className="text-foreground">Send</strong>.</li>
          <li>Review the response, routing metadata, and cost estimate.</li>
          <li>Optionally, use <strong className="text-foreground">Recommend</strong> to see the routing decision without making an LLM call.</li>
        </ol>
      </div>

      <Callout type="tip">
        The Playground uses the same API as your production requests. Any
        configuration changes you test here will produce identical results
        when deployed.
      </Callout>
    </div>
  );
}

/* ================================================================== */
/*  11. API: POST /v1/chat/completions                                 */
/* ================================================================== */

export function ApiCompletionsContent() {
  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <h1 className="text-3xl font-semibold text-foreground">
          Chat Completions
        </h1>
        <P>
          The primary endpoint for generating responses. Fully compatible with
          the OpenAI chat completions format — existing SDKs and tools work
          without modification.
        </P>
      </div>

      <EndpointHeader method="POST" path="/v1/chat/completions" />

      <div className="space-y-4">
        <H2>Request body</H2>
        <div className="rounded-lg border border-border p-5">
          <div className="divide-y divide-border">
            <Param name="messages" type="array" required>
              Array of message objects with{" "}
              <InlineCode>role</InlineCode> (<InlineCode>system</InlineCode>,{" "}
              <InlineCode>user</InlineCode>, <InlineCode>assistant</InlineCode>)
              and <InlineCode>content</InlineCode>.
            </Param>
            <Param name="model" type="string | null">
              Model to use. Omit or pass <InlineCode>"auto"</InlineCode> for
              intelligent routing. Or specify a model like{" "}
              <InlineCode>"gpt-4o"</InlineCode> to pin the request.
            </Param>
            <Param name="temperature" type="float">
              Sampling temperature between 0 and 2. Defaults to the preset value
              or 0.7.
            </Param>
            <Param name="max_tokens" type="integer">
              Maximum tokens to generate (1–128,000).
            </Param>
            <Param name="top_p" type="float">
              Nucleus sampling parameter (0–1).
            </Param>
            <Param name="stream" type="boolean">
              Enable streaming responses. Defaults to false.
            </Param>
            <Param name="frequency_penalty" type="float">
              Frequency penalty (-2 to 2).
            </Param>
            <Param name="presence_penalty" type="float">
              Presence penalty (-2 to 2).
            </Param>
            <Param name="smart_export" type="boolean">
              Force Smart Export routing to the expert model.
            </Param>
            <Param name="response_format" type="object">
              Request structured output. Use{" "}
              <InlineCode>{`{"type": "json_object"}`}</InlineCode> or{" "}
              <InlineCode>{`{"type": "json_schema", "schema": {...}}`}</InlineCode>.
              Malformed JSON responses are automatically repaired when this is set.
            </Param>
            <Param name="reasoning" type="object">
              Enable reasoning/thinking tokens. Accepts{" "}
              <InlineCode>effort</InlineCode> (<InlineCode>"low"</InlineCode>,{" "}
              <InlineCode>"medium"</InlineCode>, <InlineCode>"high"</InlineCode>)
              and optional <InlineCode>max_tokens</InlineCode> budget. Automatically
              mapped to provider-native APIs (OpenAI reasoning_effort, Anthropic
              thinking, Gemini thinking_config).
            </Param>
          </div>
        </div>
        <Callout type="tip">
          Messages can include a <InlineCode>cache_control</InlineCode> field
          (e.g. <InlineCode>{`{"type": "ephemeral"}`}</InlineCode>) for
          Anthropic/OpenAI prompt caching. Cache metrics are returned in the
          response <InlineCode>usage</InlineCode> and{" "}
          <InlineCode>nadir_metadata</InlineCode>.
        </Callout>
      </div>

      <div className="space-y-4">
        <H2>Example request</H2>
        <CodeTabs
          examples={[
            {
              label: "Python",
              language: "python",
              code: `import openai

client = openai.OpenAI(
    base_url="https://api.nadir.dev/v1",
    api_key="YOUR_NADIR_API_KEY",
)

response = client.chat.completions.create(
    messages=[
        {"role": "system", "content": "You are a helpful assistant."},
        {"role": "user", "content": "Explain quantum computing in simple terms."},
    ],
    model="auto",
    temperature=0.7,
    max_tokens=500,
)

print(response.choices[0].message.content)`,
            },
            {
              label: "cURL",
              language: "curl",
              code: `curl https://api.nadir.dev/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: YOUR_NADIR_API_KEY" \\
  -d '{
    "messages": [
      {"role": "system", "content": "You are a helpful assistant."},
      {"role": "user", "content": "Explain quantum computing in simple terms."}
    ],
    "model": "auto",
    "temperature": 0.7,
    "max_tokens": 500
  }'`,
            },
            {
              label: "JavaScript",
              language: "javascript",
              code: `const response = await fetch("https://api.nadir.dev/v1/chat/completions", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-API-Key": "YOUR_NADIR_API_KEY",
  },
  body: JSON.stringify({
    messages: [
      { role: "system", content: "You are a helpful assistant." },
      { role: "user", content: "Explain quantum computing in simple terms." },
    ],
    model: "auto",
    temperature: 0.7,
    max_tokens: 500,
  }),
});

const data = await response.json();
console.log(data.choices[0].message.content);`,
            },
          ]}
        />
      </div>

      <div className="space-y-4">
        <H2>Response body</H2>
        <CodeBlock label="Example response">{`{
  "id": "nadir-a1b2c3d4",
  "object": "chat.completion",
  "created": 1700000000,
  "model": "gpt-4o-mini",
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
    "prompt_tokens": 24,
    "completion_tokens": 85,
    "total_tokens": 109,
    "reasoning_tokens": 0,
    "cache_read_input_tokens": 0,
    "cache_creation_input_tokens": 0
  },
  "nadir_metadata": {
    "request_id": "nadir-a1b2c3d4",
    "response_time_ms": 420,
    "routing_strategy": "smart-routing",
    "provider": "openai",
    "provider_health": 0.98,
    "cost": {
      "total_cost_usd": 0.00012,
      "llm_cost_usd": 0.00010,
      "routing_fee_usd": 0.002
    },
    "complexity_analysis": { "...": "..." }
  }
}`}</CodeBlock>
        <Callout type="info">
          When prompt caching is active, <InlineCode>nadir_metadata</InlineCode>{" "}
          includes a <InlineCode>prompt_caching</InlineCode> object with{" "}
          <InlineCode>cached_tokens</InlineCode> and{" "}
          <InlineCode>cache_creation_tokens</InlineCode>. If a response was
          auto-repaired, <InlineCode>response_healed: true</InlineCode> appears.
          Empty completions are flagged with{" "}
          <InlineCode>zero_completion: true</InlineCode> and cost is set to $0.
        </Callout>
      </div>

      <div className="space-y-4">
        <H2>Streaming</H2>
        <P>
          Set <InlineCode>stream: true</InlineCode> to receive Server-Sent
          Events (SSE). Each chunk follows the OpenAI streaming format.
        </P>
        <CodeBlock label="Streaming with Python">{`response = client.chat.completions.create(
    messages=[{"role": "user", "content": "Tell me a story"}],
    model="auto",
    stream=True,
)

for chunk in response:
    if chunk.choices[0].delta.content:
        print(chunk.choices[0].delta.content, end="")
print()`}</CodeBlock>
      </div>
    </div>
  );
}

/* ================================================================== */
/*  12. API: Models                                                    */
/* ================================================================== */

export function ApiModelsContent() {
  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <h1 className="text-3xl font-semibold text-foreground">Models API</h1>
        <P>
          List all models available to your account, including provider-hosted
          and BYOK models.
        </P>
      </div>

      <EndpointHeader method="GET" path="/v1/models" />

      <div className="space-y-4">
        <H2>Request</H2>
        <P>
          No request body required. Authenticate with your API key in the
          header.
        </P>

        <CodeTabs
          examples={[
            {
              label: "Python",
              language: "python",
              code: `import openai

client = openai.OpenAI(
    base_url="https://api.nadir.dev/v1",
    api_key="YOUR_NADIR_API_KEY",
)

models = client.models.list()
for model in models.data:
    print(f"{model.id} ({model.owned_by})")`,
            },
            {
              label: "cURL",
              language: "curl",
              code: `curl https://api.nadir.dev/v1/models \\
  -H "X-API-Key: YOUR_NADIR_API_KEY"`,
            },
            {
              label: "JavaScript",
              language: "javascript",
              code: `const response = await fetch("https://api.nadir.dev/v1/models", {
  headers: { "X-API-Key": "YOUR_NADIR_API_KEY" },
});

const { data } = await response.json();
data.forEach(model => console.log(\`\${model.id} (\${model.owned_by})\`));`,
            },
          ]}
        />
      </div>

      <div className="space-y-4">
        <H2>Response body</H2>
        <CodeBlock label="Example response">{`{
  "object": "list",
  "data": [
    {
      "id": "gpt-4o",
      "object": "model",
      "owned_by": "openai",
      "created": 1700000000
    },
    {
      "id": "claude-3.5-sonnet",
      "object": "model",
      "owned_by": "anthropic",
      "created": 1700000000
    },
    {
      "id": "gemini-2.0-flash",
      "object": "model",
      "owned_by": "google",
      "created": 1700000000
    }
  ]
}`}</CodeBlock>
      </div>

      <div className="space-y-4">
        <H2>Response fields</H2>
        <div className="rounded-lg border border-border p-5">
          <div className="divide-y divide-border">
            <Param name="id" type="string">The model identifier used in completion requests.</Param>
            <Param name="object" type="string">Always <InlineCode>"model"</InlineCode>.</Param>
            <Param name="owned_by" type="string">The provider that hosts the model.</Param>
            <Param name="created" type="integer">Unix timestamp of when the model was added.</Param>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ================================================================== */
/*  13. API: Clustering                                                */
/* ================================================================== */

export function ApiClusteringContent() {
  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <h1 className="text-3xl font-semibold text-foreground">
          Clustering API
        </h1>
        <P>
          Programmatic access to prompt clustering — classify prompts, list
          clusters, and manage routing policies.
        </P>
      </div>

      <div className="space-y-6">
        <H2>Classify a prompt</H2>
        <EndpointHeader method="POST" path="/v1/clustering/classify" />

        <div className="rounded-lg border border-border p-5">
          <h4 className="text-sm font-semibold text-foreground mb-3">Request body</h4>
          <div className="divide-y divide-border">
            <Param name="prompt" type="string" required>
              The prompt text to classify against existing clusters.
            </Param>
          </div>
        </div>

        <CodeTabs
          examples={[
            {
              label: "Python",
              language: "python",
              code: `import requests

response = requests.post(
    "https://api.nadir.dev/v1/clustering/classify",
    headers={"X-API-Key": "YOUR_NADIR_API_KEY"},
    json={"prompt": "Write a SQL query to find duplicate rows"},
)

data = response.json()
print(f"Cluster: {data['cluster_name']}")
print(f"Confidence: {data['confidence']}")
print(f"Policy: {data['routing_policy']}")`,
            },
            {
              label: "cURL",
              language: "curl",
              code: `curl https://api.nadir.dev/v1/clustering/classify \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: YOUR_NADIR_API_KEY" \\
  -d '{"prompt": "Write a SQL query to find duplicate rows"}'`,
            },
            {
              label: "JavaScript",
              language: "javascript",
              code: `const response = await fetch("https://api.nadir.dev/v1/clustering/classify", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-API-Key": "YOUR_NADIR_API_KEY",
  },
  body: JSON.stringify({
    prompt: "Write a SQL query to find duplicate rows",
  }),
});

const data = await response.json();
console.log(\`Cluster: \${data.cluster_name} (confidence: \${data.confidence})\`);`,
            },
          ]}
        />

        <CodeBlock label="Example response">{`{
  "cluster_id": "cl_abc123",
  "cluster_name": "SQL Queries",
  "confidence": 0.92,
  "routing_policy": {
    "preferred_model": "gpt-4o-mini",
    "strategy": "smart-routing"
  }
}`}</CodeBlock>
      </div>

      <div className="space-y-6">
        <H2>List clusters</H2>
        <EndpointHeader method="GET" path="/v1/clustering/clusters" />
        <P>
          Returns all clusters for your account with summary statistics.
        </P>

        <CodeBlock label="Example response">{`{
  "clusters": [
    {
      "id": "cl_abc123",
      "name": "SQL Queries",
      "prompt_count": 42,
      "routing_policy": {
        "preferred_model": "gpt-4o-mini",
        "strategy": "smart-routing"
      }
    },
    {
      "id": "cl_def456",
      "name": "Creative Writing",
      "prompt_count": 28,
      "routing_policy": {
        "preferred_model": "claude-3.5-sonnet",
        "strategy": "pinned"
      }
    }
  ]
}`}</CodeBlock>
      </div>
    </div>
  );
}

/* ================================================================== */
/*  14. API: Recommendation                                            */
/* ================================================================== */

export function ApiRecommendationContent() {
  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <h1 className="text-3xl font-semibold text-foreground">
          Model Recommendation
        </h1>
        <P>
          Get a model recommendation without making an LLM call. Useful for
          previewing routing decisions, building custom logic, or logging which
          model would be selected.
        </P>
      </div>

      <EndpointHeader method="POST" path="/v1/chat/recommendation" />

      <div className="space-y-4">
        <H2>Request body</H2>
        <div className="rounded-lg border border-border p-5">
          <div className="divide-y divide-border">
            <Param name="messages" type="array" required>
              Array of message objects (same format as chat completions).
            </Param>
            <Param name="model" type="string | null">
              Specify <InlineCode>"auto"</InlineCode> or omit for a routing
              recommendation. If you pin a model, the response confirms it.
            </Param>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <H2>Example</H2>
        <CodeTabs
          examples={[
            {
              label: "Python",
              language: "python",
              code: `import requests

response = requests.post(
    "https://api.nadir.dev/v1/chat/recommendation",
    headers={"X-API-Key": "YOUR_NADIR_API_KEY"},
    json={
        "messages": [
            {"role": "user", "content": "Prove the Riemann hypothesis"}
        ]
    },
)

rec = response.json()
print(f"Recommended: {rec['model']}")
print(f"Tier: {rec['complexity_tier']}")
print(f"Estimated cost: \${rec['estimated_cost_usd']}")`,
            },
            {
              label: "cURL",
              language: "curl",
              code: `curl https://api.nadir.dev/v1/chat/recommendation \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: YOUR_NADIR_API_KEY" \\
  -d '{
    "messages": [
      {"role": "user", "content": "Prove the Riemann hypothesis"}
    ]
  }'`,
            },
            {
              label: "JavaScript",
              language: "javascript",
              code: `const response = await fetch("https://api.nadir.dev/v1/chat/recommendation", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-API-Key": "YOUR_NADIR_API_KEY",
  },
  body: JSON.stringify({
    messages: [{ role: "user", content: "Prove the Riemann hypothesis" }],
  }),
});

const rec = await response.json();
console.log(\`Recommended: \${rec.model} (tier: \${rec.complexity_tier})\`);`,
            },
          ]}
        />
      </div>

      <div className="space-y-4">
        <H2>Response body</H2>
        <CodeBlock label="Example response">{`{
  "model": "claude-3-opus",
  "complexity_tier": "expert",
  "complexity_score": 0.94,
  "routed_by": "smart-routing",
  "estimated_cost_usd": 0.045,
  "alternatives": [
    {"model": "gpt-4-turbo", "estimated_cost_usd": 0.038},
    {"model": "o1", "estimated_cost_usd": 0.052}
  ]
}`}</CodeBlock>

        <div className="rounded-lg border border-border p-5">
          <h4 className="text-sm font-semibold text-foreground mb-3">Response fields</h4>
          <div className="divide-y divide-border">
            <Param name="model" type="string">The recommended model identifier.</Param>
            <Param name="complexity_tier" type="string">Detected complexity tier.</Param>
            <Param name="complexity_score" type="float">Raw complexity score (0–1).</Param>
            <Param name="routed_by" type="string">Routing method used.</Param>
            <Param name="estimated_cost_usd" type="float">Estimated cost for a typical response.</Param>
            <Param name="alternatives" type="array">Other models considered, ranked by score.</Param>
          </div>
        </div>
      </div>

      <Callout type="tip">
        The recommendation endpoint is free — no tokens are consumed. Use it
        to build custom routing logic or to preview decisions in your
        application.
      </Callout>
    </div>
  );
}

/* ================================================================== */
/*  14b. API: Distillation                                             */
/* ================================================================== */

export function ApiDistillationContent() {
  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <h1 className="text-3xl font-semibold text-foreground">
          Distillation API
        </h1>
        <P>
          Manage the full distillation lifecycle — check readiness, trigger
          training, monitor jobs, and control distilled models.
        </P>
      </div>

      {/* --- Status --- */}
      <div className="space-y-6">
        <H2>Distillation status</H2>
        <EndpointHeader method="GET" path="/v1/distillation/status" />
        <P>
          Returns an overview of every cluster's distillation readiness,
          including sample counts, active models, and pending jobs.
        </P>

        <CodeTabs
          examples={[
            {
              label: "Python",
              language: "python",
              code: `import requests

response = requests.get(
    "https://api.nadir.dev/v1/distillation/status",
    headers={"X-API-Key": "YOUR_NADIR_API_KEY"},
)

for cluster in response.json()["clusters"]:
    print(f"{cluster['cluster_id']}: "
          f"{cluster['sample_count']} samples, "
          f"ready={cluster['eligible_for_training']}")`,
            },
            {
              label: "cURL",
              language: "curl",
              code: `curl https://api.nadir.dev/v1/distillation/status \\
  -H "X-API-Key: YOUR_NADIR_API_KEY"`,
            },
            {
              label: "JavaScript",
              language: "javascript",
              code: `const response = await fetch("https://api.nadir.dev/v1/distillation/status", {
  headers: { "X-API-Key": "YOUR_NADIR_API_KEY" },
});

const { clusters } = await response.json();
clusters.forEach(c =>
  console.log(\`\${c.cluster_id}: \${c.sample_count} samples\`)
);`,
            },
          ]}
        />

        <CodeBlock label="Example response">{`{
  "clusters": [
    {
      "cluster_id": "Basic_SingleFunction",
      "sample_count": 342,
      "eligible_for_training": true,
      "active_model": null,
      "pending_job": null
    },
    {
      "cluster_id": "API_and_Web_Requests",
      "sample_count": 128,
      "eligible_for_training": false,
      "active_model": "ft:gpt-4o-mini:nadir::abc123",
      "pending_job": null
    }
  ]
}`}</CodeBlock>
      </div>

      {/* --- Train --- */}
      <div className="space-y-6">
        <H2>Trigger training</H2>
        <EndpointHeader method="POST" path="/v1/distillation/clusters/{cluster_id}/train" />
        <P>
          Start a distillation training job for a specific cluster.
        </P>

        <div className="rounded-lg border border-border p-5">
          <h4 className="text-sm font-semibold text-foreground mb-3">
            Request body
          </h4>
          <div className="divide-y divide-border">
            <Param name="job_type" type="string">
              Training method: <InlineCode>"openai"</InlineCode> (default) or{" "}
              <InlineCode>"local"</InlineCode> for LoRA.
            </Param>
            <Param name="base_model" type="string">
              Base model to fine-tune. Default:{" "}
              <InlineCode>gpt-4o-mini-2024-07-18</InlineCode> for OpenAI,{" "}
              <InlineCode>microsoft/Phi-3-mini-4k-instruct</InlineCode> for
              local.
            </Param>
            <Param name="teacher_model" type="string">
              Teacher model name stored in metadata. Auto-detected from samples
              if omitted.
            </Param>
            <Param name="system_prompt" type="string">
              System prompt to include in training examples. Optional.
            </Param>
            <Param name="n_epochs" type="integer">
              Number of training epochs. Default: 3.
            </Param>
            <Param name="learning_rate_multiplier" type="float">
              Learning rate multiplier. Default: 1.0.
            </Param>
            <Param name="min_samples" type="integer">
              Override the minimum sample threshold for this job.
            </Param>
            <Param name="validation_split" type="float">
              Fraction of samples to hold out for validation. Default: 0.1.
            </Param>
          </div>
        </div>

        <CodeBlock label="Example response">{`{
  "job_id": "ftjob-abc123",
  "status": "preparing",
  "cluster_id": "Basic_SingleFunction",
  "base_model": "gpt-4o-mini-2024-07-18",
  "training_samples_count": 308,
  "validation_samples_count": 34,
  "created_at": "2026-02-23T10:30:00Z"
}`}</CodeBlock>
      </div>

      {/* --- Jobs --- */}
      <div className="space-y-6">
        <H2>List jobs</H2>
        <EndpointHeader method="GET" path="/v1/distillation/jobs" />
        <P>
          Returns all distillation jobs for your account, ordered by creation
          date.
        </P>

        <CodeBlock label="Example response">{`{
  "jobs": [
    {
      "id": "ftjob-abc123",
      "cluster_id": "Basic_SingleFunction",
      "status": "deployed",
      "base_model": "gpt-4o-mini-2024-07-18",
      "fine_tuned_model": "ft:gpt-4o-mini:nadir::abc123",
      "training_samples_count": 308,
      "trigger_type": "manual",
      "created_at": "2026-02-23T10:30:00Z"
    }
  ]
}`}</CodeBlock>
      </div>

      <div className="space-y-6">
        <H2>Get job details</H2>
        <EndpointHeader method="GET" path="/v1/distillation/jobs/{job_id}" />
        <P>
          Returns full details for a specific job, including hyperparameters and
          OpenAI training metrics (when available).
        </P>
      </div>

      <div className="space-y-6">
        <H2>Cancel a job</H2>
        <EndpointHeader method="DELETE" path="/v1/distillation/jobs/{job_id}" />
        <P>
          Cancels a training job. Only jobs in{" "}
          <InlineCode>preparing</InlineCode>,{" "}
          <InlineCode>validating_files</InlineCode>, or{" "}
          <InlineCode>training</InlineCode> status can be cancelled.
        </P>
      </div>

      {/* --- Models --- */}
      <div className="space-y-6">
        <H2>List distilled models</H2>
        <EndpointHeader method="GET" path="/v1/distillation/models" />
        <P>
          Returns all distilled expert models for your account.
        </P>

        <CodeBlock label="Example response">{`{
  "models": [
    {
      "id": "exp-abc123",
      "cluster_id": "Basic_SingleFunction",
      "model_name": "ft:gpt-4o-mini:nadir::abc123",
      "is_active": true,
      "quality_gate_passed": true,
      "quality_score": 0.85,
      "request_count": 1247,
      "total_cost_saved": 3.42,
      "created_at": "2026-02-20T14:00:00Z"
    }
  ]
}`}</CodeBlock>
      </div>

      <div className="space-y-6">
        <H2>Activate / deactivate a model</H2>
        <EndpointHeader method="POST" path="/v1/distillation/models/{model_id}/activate" />
        <EndpointHeader method="POST" path="/v1/distillation/models/{model_id}/deactivate" />
        <P>
          Toggle whether a distilled model receives production traffic. The
          deactivate endpoint accepts an optional{" "}
          <InlineCode>reason</InlineCode> field in the request body.
        </P>
      </div>

      <div className="space-y-6">
        <H2>Run quality check</H2>
        <EndpointHeader method="POST" path="/v1/distillation/models/{model_id}/evaluate" />
        <P>
          Manually trigger a quality evaluation. Sends validation prompts to
          the distilled model and compares against teacher responses.
        </P>

        <CodeBlock label="Example response">{`{
  "model_id": "exp-abc123",
  "avg_similarity": 0.82,
  "pass_rate": 0.90,
  "quality_score": 0.85,
  "passed": true,
  "prompts_evaluated": 20,
  "check_type": "manual"
}`}</CodeBlock>
      </div>

      <div className="space-y-6">
        <H2>Quality check history</H2>
        <EndpointHeader method="GET" path="/v1/distillation/models/{model_id}/quality" />
        <P>
          Returns all quality evaluations for a model, ordered by date.
          Includes quality gate checks, periodic checks, and manual evaluations.
        </P>
      </div>

      {/* --- Export --- */}
      <div className="space-y-6">
        <H2>Export training data</H2>
        <EndpointHeader method="POST" path="/v1/distillation/clusters/{cluster_id}/export" />
        <P>
          Download training samples in your preferred format for external use.
        </P>

        <div className="rounded-lg border border-border p-5">
          <h4 className="text-sm font-semibold text-foreground mb-3">
            Request body
          </h4>
          <div className="divide-y divide-border">
            <Param name="format" type="string">
              Export format: <InlineCode>"openai"</InlineCode> (JSONL, default),{" "}
              <InlineCode>"alpaca"</InlineCode>, or{" "}
              <InlineCode>"sharegpt"</InlineCode>.
            </Param>
            <Param name="limit" type="integer">
              Maximum number of samples to export. Defaults to all.
            </Param>
          </div>
        </div>

        <CodeBlock label="OpenAI JSONL format (one line per sample)">{`{"messages": [{"role": "system", "content": "..."}, {"role": "user", "content": "Write a function..."}, {"role": "assistant", "content": "def hello():..."}]}
{"messages": [{"role": "user", "content": "Explain SQL joins"}, {"role": "assistant", "content": "SQL joins combine rows..."}]}`}</CodeBlock>
      </div>

      <Callout type="info">
        All distillation endpoints require authentication via{" "}
        <InlineCode>X-API-Key</InlineCode>. Jobs and models are scoped to
        your account — you can only access your own resources.
      </Callout>
    </div>
  );
}

/* ================================================================== */
/*  15. PARAMETERS REFERENCE                                           */
/* ================================================================== */

export function ParametersContent() {
  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <h1 className="text-3xl font-semibold text-foreground">
          Parameters Reference
        </h1>
        <P>
          Complete reference for all parameters supported across Nadir's API
          endpoints.
        </P>
      </div>

      <div className="space-y-4">
        <H2>Chat completion parameters</H2>
        <div className="rounded-lg border border-border p-5">
          <div className="divide-y divide-border">
            <Param name="messages" type="array" required>
              Array of message objects. Each object has a{" "}
              <InlineCode>role</InlineCode> (
              <InlineCode>system</InlineCode>,{" "}
              <InlineCode>user</InlineCode>,{" "}
              <InlineCode>assistant</InlineCode>,{" "}
              <InlineCode>tool</InlineCode>) and <InlineCode>content</InlineCode>{" "}
              (string or array for multimodal).
            </Param>
            <Param name="model" type="string | null">
              Model identifier. Use <InlineCode>"auto"</InlineCode> for smart
              routing, or specify a model name to pin.
            </Param>
            <Param name="temperature" type="float">
              Controls randomness. Range: 0–2. Lower values are more
              deterministic. Default: 0.7 (or preset value).
            </Param>
            <Param name="max_tokens" type="integer">
              Maximum tokens in the response. Range: 1–128,000. Provider limits
              may apply.
            </Param>
            <Param name="top_p" type="float">
              Nucleus sampling. Range: 0–1. Use either temperature or top_p, not
              both. Default: 1.
            </Param>
            <Param name="frequency_penalty" type="float">
              Penalizes tokens based on frequency in the text so far. Range: -2
              to 2. Default: 0.
            </Param>
            <Param name="presence_penalty" type="float">
              Penalizes tokens that have appeared at all. Range: -2 to 2.
              Default: 0.
            </Param>
            <Param name="stream" type="boolean">
              If true, returns a stream of Server-Sent Events. Default: false.
            </Param>
            <Param name="stop" type="string | array">
              Up to 4 sequences where the model will stop generating.
            </Param>
            <Param name="n" type="integer">
              How many completions to generate. Default: 1.
            </Param>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <H2>Nadir-specific parameters</H2>
        <div className="rounded-lg border border-border p-5">
          <div className="divide-y divide-border">
            <Param name="smart_export" type="boolean">
              Force routing to the Smart Export expert model.
            </Param>
            <Param name="fallback" type="boolean">
              Enable/disable automatic fallback. Default: true.
            </Param>
            <Param name="metadata" type="object">
              Arbitrary key-value metadata attached to the request log.
            </Param>
            <Param name="response_format" type="object">
              Request structured output. Set{" "}
              <InlineCode>type</InlineCode> to{" "}
              <InlineCode>"json_object"</InlineCode> or{" "}
              <InlineCode>"json_schema"</InlineCode>. When set, malformed JSON
              responses are automatically repaired (response healing).
            </Param>
            <Param name="reasoning" type="object">
              Enable reasoning/thinking tokens. Fields:{" "}
              <InlineCode>effort</InlineCode> (<InlineCode>"low"</InlineCode>,{" "}
              <InlineCode>"medium"</InlineCode>, <InlineCode>"high"</InlineCode>)
              and <InlineCode>max_tokens</InlineCode> (1–128,000). Mapped to
              provider-native APIs: OpenAI <InlineCode>reasoning_effort</InlineCode>,
              Anthropic <InlineCode>thinking</InlineCode>, Google{" "}
              <InlineCode>thinking_config</InlineCode>.
            </Param>
            <Param name="messages[].cache_control" type="object">
              Per-message cache control for prompt caching. Example:{" "}
              <InlineCode>{`{"type": "ephemeral"}`}</InlineCode>. Passed through
              to Anthropic/OpenAI. Cache metrics returned in response usage.
            </Param>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <H2>Preset-inherited parameters</H2>
        <P>
          These parameters are typically set in a preset and inherited by all
          requests using that preset's API key. Request-level values always
          override.
        </P>
        <div className="rounded-lg border border-border p-5">
          <div className="divide-y divide-border">
            <Param name="system_prompt" type="string">
              Injected as the first system message if no system message is present
              in the request.
            </Param>
            <Param name="allowed_models" type="array">
              Restricts smart routing to these models only.
            </Param>
            <Param name="routing_strategy" type="string">
              One of <InlineCode>smart</InlineCode>,{" "}
              <InlineCode>round-robin</InlineCode>,{" "}
              <InlineCode>weighted</InlineCode>,{" "}
              <InlineCode>latency</InlineCode>,{" "}
              <InlineCode>cost</InlineCode>.
            </Param>
            <Param name="budget_limit_usd" type="float">
              Maximum cost per request in USD. Requests exceeding this are
              rejected.
            </Param>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <H2>Response metadata fields</H2>
        <P>
          The <InlineCode>nadir_metadata</InlineCode> object in the response
          includes the following fields when applicable:
        </P>
        <div className="rounded-lg border border-border p-5">
          <div className="divide-y divide-border">
            <Param name="provider_health" type="float">
              Provider health score at request time (0.0–1.0). Based on rolling
              success rate, latency, and circuit breaker state. Unhealthy
              providers are automatically ranked lower.
            </Param>
            <Param name="prompt_caching" type="object">
              Present when prompt caching is active. Contains{" "}
              <InlineCode>cached_tokens</InlineCode> and{" "}
              <InlineCode>cache_creation_tokens</InlineCode>.
            </Param>
            <Param name="response_healed" type="boolean">
              <InlineCode>true</InlineCode> when a malformed JSON response was
              automatically repaired. Only appears when{" "}
              <InlineCode>response_format</InlineCode> is set.
            </Param>
            <Param name="zero_completion" type="boolean">
              <InlineCode>true</InlineCode> when the provider returned an empty
              response or zero completion tokens. Cost is automatically set to
              $0 (zero completion insurance).
            </Param>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <H2>Extended usage fields</H2>
        <P>
          The <InlineCode>usage</InlineCode> object may include additional token
          counts beyond the standard OpenAI fields:
        </P>
        <div className="rounded-lg border border-border p-5">
          <div className="divide-y divide-border">
            <Param name="reasoning_tokens" type="integer">
              Number of reasoning/thinking tokens consumed. Present when using
              models with reasoning capabilities (o-series, Claude thinking,
              Gemini 2.5) with the <InlineCode>reasoning</InlineCode> parameter.
            </Param>
            <Param name="cache_read_input_tokens" type="integer">
              Prompt tokens served from cache. Present when prompt caching is
              active.
            </Param>
            <Param name="cache_creation_input_tokens" type="integer">
              Prompt tokens written to cache. Present on the first request that
              populates the cache.
            </Param>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ================================================================== */
/*  16. ERRORS & STATUS CODES                                          */
/* ================================================================== */

export function ErrorsContent() {
  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <h1 className="text-3xl font-semibold text-foreground">
          Errors & Status Codes
        </h1>
        <P>
          Nadir returns standard HTTP status codes. Error responses include a
          JSON body with a descriptive message.
        </P>
      </div>

      <div className="space-y-4">
        <H2>HTTP status codes</H2>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left px-4 py-3 font-semibold text-foreground w-24">Code</th>
                <th className="text-left px-4 py-3 font-semibold text-foreground">Meaning</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {[
                ["200", "Success — the request was processed successfully."],
                ["400", "Bad request — check your request body format and required fields."],
                ["401", "Unauthorized — invalid or missing API key."],
                ["403", "Forbidden — key is valid but lacks permission for this action."],
                ["404", "Not found — the endpoint or resource doesn't exist."],
                ["409", "Conflict — the request conflicts with current state (e.g., duplicate key name)."],
                ["422", "Unprocessable — request was valid JSON but failed validation."],
                ["429", "Rate limited — slow down and retry after the indicated delay."],
                ["500", "Server error — an unexpected error occurred. Retry or contact support."],
                ["502", "Bad gateway — the upstream LLM provider returned an error."],
                ["503", "Service unavailable — the service is temporarily overloaded."],
              ].map(([code, desc]) => (
                <tr key={code}>
                  <td className="px-4 py-3 font-mono font-semibold text-foreground">{code}</td>
                  <td className="px-4 py-3 text-muted-foreground">{desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-4">
        <H2>Error response format</H2>
        <CodeBlock label="Error response">{`{
  "error": {
    "message": "Invalid API key provided.",
    "type": "authentication_error",
    "code": "invalid_api_key"
  }
}`}</CodeBlock>

        <div className="rounded-lg border border-border p-5">
          <h4 className="text-sm font-semibold text-foreground mb-3">Error fields</h4>
          <div className="divide-y divide-border">
            <Param name="message" type="string">Human-readable description of the error.</Param>
            <Param name="type" type="string">
              Error category: <InlineCode>authentication_error</InlineCode>,{" "}
              <InlineCode>invalid_request_error</InlineCode>,{" "}
              <InlineCode>rate_limit_error</InlineCode>,{" "}
              <InlineCode>server_error</InlineCode>,{" "}
              <InlineCode>provider_error</InlineCode>.
            </Param>
            <Param name="code" type="string">
              Machine-readable error code for programmatic handling.
            </Param>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <H2>Handling errors</H2>
        <CodeTabs
          examples={[
            {
              label: "Python",
              language: "python",
              code: `import openai

client = openai.OpenAI(
    base_url="https://api.nadir.dev/v1",
    api_key="YOUR_NADIR_API_KEY",
)

try:
    response = client.chat.completions.create(
        messages=[{"role": "user", "content": "Hello"}],
        model="auto",
    )
except openai.AuthenticationError:
    print("Invalid API key")
except openai.RateLimitError:
    print("Rate limited — retry after backoff")
except openai.APIStatusError as e:
    print(f"API error {e.status_code}: {e.message}")`,
            },
            {
              label: "cURL",
              language: "curl",
              code: `# Check the HTTP status code
curl -w "\\nHTTP Status: %{http_code}\\n" \\
  https://api.nadir.dev/v1/chat/completions \\
  -H "X-API-Key: YOUR_NADIR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"messages": [{"role": "user", "content": "Hello"}]}'`,
            },
            {
              label: "JavaScript",
              language: "javascript",
              code: `const response = await fetch("https://api.nadir.dev/v1/chat/completions", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-API-Key": "YOUR_NADIR_API_KEY",
  },
  body: JSON.stringify({
    messages: [{ role: "user", content: "Hello" }],
  }),
});

if (!response.ok) {
  const error = await response.json();
  console.error(\`Error \${response.status}: \${error.error.message}\`);
} else {
  const data = await response.json();
  console.log(data.choices[0].message.content);
}`,
            },
          ]}
        />
      </div>

      <Callout type="info">
        When you receive a 429, check the <InlineCode>Retry-After</InlineCode>{" "}
        header for the recommended wait time before retrying.
      </Callout>
    </div>
  );
}

/* ================================================================== */
/*  Content map                                                        */
/* ================================================================== */

export const docsContentMap: Record<string, () => JSX.Element> = {
  quickstart: QuickstartContent,
  authentication: AuthenticationContent,
  models: ModelsContent,
  "smart-routing": SmartRoutingContent,
  presets: PresetsContent,
  fallbacks: FallbacksContent,
  clustering: ClusteringContent,
  "smart-export": SmartExportContent,
  distillation: DistillationContent,
  analytics: AnalyticsContent,
  playground: PlaygroundContent,
  "api-completions": ApiCompletionsContent,
  "api-models": ApiModelsContent,
  "api-clustering": ApiClusteringContent,
  "api-recommendation": ApiRecommendationContent,
  "api-distillation": ApiDistillationContent,
  parameters: ParametersContent,
  errors: ErrorsContent,
};
