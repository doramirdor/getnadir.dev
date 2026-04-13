import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { SEO } from "@/components/SEO";

export default function Privacy() {
  const navigate = useNavigate();

  return (
    <MarketingLayout>
      <SEO title="Privacy Policy - Nadir" description="Privacy policy for Nadir Tech LLC." path="/privacy" />
      <div className="container mx-auto px-6 py-8 max-w-3xl">
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
          Last updated: April 12, 2026
        </p>

        <div className="prose prose-neutral max-w-none space-y-8 text-muted-foreground leading-relaxed">
          <section className="space-y-3">
            <p>
              Nadir Tech LLC ("Nadir," "we," "us," or "our") operates the Nadir platform at getnadir.com. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our service.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">1. Information We Collect</h2>
            <p>
              <strong className="text-foreground">Account Information.</strong> When you create an account we collect your email address and, if you use OAuth (Google or GitHub), your name and profile picture from the identity provider.
            </p>
            <p>
              <strong className="text-foreground">Usage Data.</strong> When you use the API we log request metadata such as timestamps, model selections, token counts, and latency. We do <strong className="text-foreground">not</strong> store the content of your prompts or completions beyond the duration of the request unless you explicitly enable prompt clustering.
            </p>
            <p>
              <strong className="text-foreground">Payment Information.</strong> If you subscribe to a paid plan, payment processing is handled by Stripe. We do not store your full credit card number on our servers.
            </p>
            <p>
              <strong className="text-foreground">Device &amp; Log Data.</strong> We automatically collect information such as your browser type, IP address, and referring URL when you visit our website. This information is used for analytics and security purposes.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">2. How We Use Your Information</h2>
            <p>
              We use collected information to:
            </p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Operate, maintain, and improve the Nadir platform</li>
              <li>Calculate billing and generate analytics visible in your dashboard</li>
              <li>Communicate important service updates, security alerts, and support messages</li>
              <li>Detect and prevent fraud, abuse, and security incidents</li>
              <li>Comply with legal obligations</li>
            </ul>
            <p>
              We never sell your personal data to third parties.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">3. Data Storage &amp; Security</h2>
            <p>
              All data is stored in Supabase-managed PostgreSQL databases with encryption at rest and in transit. API keys are hashed before storage. Access to production systems is restricted and audited. While we implement commercially reasonable security measures, no method of electronic transmission or storage is 100% secure.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">4. Third-Party Services</h2>
            <p>
              Requests you send through Nadir are forwarded to third-party LLM providers (e.g., OpenAI, Anthropic, Google) according to your routing configuration. Each provider's own privacy policy applies to the data they process. We also use the following third-party services:
            </p>
            <ul className="list-disc pl-6 space-y-1">
              <li><strong className="text-foreground">Stripe</strong> for payment processing</li>
              <li><strong className="text-foreground">Supabase</strong> for authentication and data storage</li>
              <li><strong className="text-foreground">PostHog</strong> for product analytics</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">5. Cookies &amp; Tracking</h2>
            <p>
              We use essential cookies to maintain your session and authentication state. We use analytics tools to understand how the service is used. You can disable non-essential cookies in your browser settings.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">6. Data Retention</h2>
            <p>
              We retain your account information for as long as your account is active. Usage logs are retained for up to 90 days for analytics and billing purposes. You may request deletion of your data at any time.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">7. Your Rights &amp; Data Deletion</h2>
            <p>
              You may permanently delete your account and all associated data at any time from the <strong className="text-foreground">Settings</strong> page of your dashboard. Deletion is immediate and irreversible. All personal information, usage data, API keys, billing records, and provider credentials are erased.
            </p>
            <p>
              <strong className="text-foreground">For EU/EEA residents (GDPR):</strong> Under the General Data Protection Regulation, you have the right to access (Art. 15), rectify (Art. 16), erase (Art. 17), restrict processing (Art. 18), data portability (Art. 20), and object to processing (Art. 21) of your personal data. To exercise these rights, use the self-service deletion in Settings or email <strong className="text-foreground">info@getnadir.com</strong>. We will respond within 30 days.
            </p>
            <p>
              <strong className="text-foreground">For California residents (CCPA):</strong> Under the California Consumer Privacy Act (CCPA/CPRA), you have the right to know what personal information we collect, to request deletion, and to opt out of the sale of personal information. We do not sell personal information. To exercise your rights, use the self-service deletion in Settings or email <strong className="text-foreground">info@getnadir.com</strong>.
            </p>
            <p>
              We will respond to all verified data subject requests within 30 days.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">8. Children's Privacy</h2>
            <p>
              Nadir is not directed to individuals under the age of 18. We do not knowingly collect personal information from children. If we learn that we have collected data from a child, we will delete it promptly.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">9. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. We will notify you of material changes by posting the updated policy on this page and updating the "Last updated" date. Your continued use of the service after changes constitutes acceptance of the revised policy.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">10. Contact</h2>
            <p>
              If you have questions about this Privacy Policy or your data, contact us at <strong className="text-foreground">info@getnadir.com</strong>.
            </p>
            <p className="text-sm">
              Nadir Tech LLC
            </p>
          </section>
        </div>
      </div>
    </MarketingLayout>
  );
}
