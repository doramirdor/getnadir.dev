import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { SEO } from "@/components/SEO";

export default function Terms() {
  const navigate = useNavigate();

  return (
    <MarketingLayout>
      <SEO title="Terms of Service — Nadir" description="Terms of service for getnadir.com." path="/terms" />
      <div className="container mx-auto px-6 py-8 max-w-3xl">
        <Button
          variant="ghost"
          className="mb-8 hover:bg-muted"
          onClick={() => navigate("/")}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Home
        </Button>

        <h1 className="text-4xl font-semibold text-foreground mb-2">Terms of Service</h1>
        <p className="text-sm text-muted-foreground mb-10">
          Last updated: {new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
        </p>

        <div className="prose prose-neutral max-w-none space-y-8 text-muted-foreground leading-relaxed">
          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">1. Acceptance of Terms</h2>
            <p>
              By accessing or using the Nadir platform you agree to be bound by these Terms of Service. If you do not agree, you may not use the service.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">2. Service Description</h2>
            <p>
              Nadir provides an intelligent LLM routing gateway that analyzes prompt complexity and routes requests to third-party language model providers on your behalf. We do not guarantee the accuracy, availability, or performance of any upstream provider.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">3. Account Responsibilities</h2>
            <p>
              You are responsible for safeguarding your API keys and for all activity that occurs under your account. You agree not to share keys publicly or use the service for any unlawful purpose.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">4. Usage &amp; Billing</h2>
            <p>
              Usage is metered based on tokens processed and routing fees. Current pricing is displayed on the Billing page of your dashboard. We reserve the right to update pricing with 30 days' notice.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">5. Limitation of Liability</h2>
            <p>
              To the maximum extent permitted by law, Nadir shall not be liable for any indirect, incidental, or consequential damages arising from your use of the service, including but not limited to loss of data or revenue.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">6. Termination</h2>
            <p>
              We may suspend or terminate your account if you violate these terms. You may delete your account at any time from the Settings page.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">7. Contact</h2>
            <p>
              Questions about these terms can be directed to <strong className="text-foreground">legal@nadir.dev</strong>.
            </p>
          </section>
        </div>
      </div>
    </MarketingLayout>
  );
}
