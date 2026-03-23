import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import MarketingLayout from "@/components/marketing/MarketingLayout";

export default function Privacy() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      <StickyCtaBar />
      <div className="container mx-auto px-6 py-8 pt-20 max-w-3xl">
        <Button
          variant="ghost"
          className="mb-8 hover:bg-muted"
          onClick={() => navigate("/")}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Home
        </Button>

        <h1 className="text-4xl font-semibold text-foreground mb-2">Privacy Policy</h1>
        <p className="text-sm text-muted-foreground mb-10">
          Last updated: {new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
        </p>

        <div className="prose prose-neutral max-w-none space-y-8 text-muted-foreground leading-relaxed">
          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">1. Information We Collect</h2>
            <p>
              When you create an account we collect your email address and, if you use OAuth, your name and profile picture from the identity provider. When you use the API we log request metadata such as timestamps, model selections, token counts, and latency. We do <strong className="text-foreground">not</strong> store the content of your prompts or completions beyond the duration of the request unless you explicitly enable prompt clustering.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">2. How We Use Your Information</h2>
            <p>
              We use collected information to operate and improve the service, calculate billing, generate analytics visible in your dashboard, and communicate important service updates. We never sell your data to third parties.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">3. Data Storage &amp; Security</h2>
            <p>
              All data is stored in Supabase-managed PostgreSQL databases with encryption at rest and in transit. API keys are hashed before storage. Access to production systems is restricted and audited.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">4. Third-Party Services</h2>
            <p>
              Requests you send through Nadir are forwarded to third-party LLM providers (e.g. OpenAI, Anthropic, Google) according to your routing configuration. Each provider's own privacy policy applies to the data they process.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">5. Your Rights</h2>
            <p>
              You may export or delete your data at any time from the Settings page. If you have questions or requests regarding your data, contact us at <strong className="text-foreground">privacy@nadir.dev</strong>.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
