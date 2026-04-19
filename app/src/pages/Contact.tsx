import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Check, Loader2, Mail } from "lucide-react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { SEO } from "@/components/SEO";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { trackContactSubmit, trackPageView } from "@/utils/analytics";

const REASONS = [
  { value: "sales", label: "Talk to sales" },
  { value: "enterprise", label: "Enterprise / SLA" },
  { value: "support", label: "Support" },
  { value: "partnership", label: "Partnership" },
  { value: "other", label: "Something else" },
];

export default function Contact() {
  const [params] = useSearchParams();
  const initialReason = params.get("reason") || "sales";
  const sourceParam = params.get("source") || "contact_page";

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [reason, setReason] = useState(initialReason);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    trackPageView("contact", { source: sourceParam, reason: initialReason });
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [sourceParam, initialReason]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.from("contact_submissions").insert({
        name: name.trim(),
        email: email.trim(),
        company: company.trim() || null,
        message: message.trim(),
        source: sourceParam,
        metadata: { reason },
      });
      if (error) throw error;
      setSent(true);
      toast({ title: "Message sent", description: "We'll be in touch shortly." });
      trackContactSubmit();
    } catch {
      toast({
        variant: "destructive",
        title: "Something went wrong",
        description: "Please try again or email info@getnadir.com.",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <MarketingLayout>
      <SEO
        title="Contact Nadir | Talk to sales or support"
        description="Get in touch with the Nadir team. Sales, enterprise plans, support, and partnership inquiries."
        path="/contact"
        jsonLd={{
          "@context": "https://schema.org",
          "@type": "ContactPage",
          name: "Contact Nadir",
          url: "https://getnadir.com/contact",
          description: "Sales, enterprise, support, and partnership inquiries for Nadir.",
          mainEntity: {
            "@type": "Organization",
            name: "Nadir",
            url: "https://getnadir.com",
            email: "info@getnadir.com",
            contactPoint: [
              {
                "@type": "ContactPoint",
                contactType: "sales",
                email: "info@getnadir.com",
                availableLanguage: ["English"],
              },
              {
                "@type": "ContactPoint",
                contactType: "customer support",
                email: "info@getnadir.com",
                availableLanguage: ["English"],
              },
            ],
          },
        }}
      />

      <section className="max-w-[1040px] mx-auto px-6 sm:px-8 py-16 md:py-24">
        <div className="grid md:grid-cols-[1fr_1.2fr] gap-12 lg:gap-16">
          <div>
            <div className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[#0071e3] mb-3">
              Contact
            </div>
            <h1 className="text-[40px] md:text-[56px] font-semibold tracking-[-0.034em] text-[#1d1d1f] leading-[1.05] mb-5">
              Let's talk.
            </h1>
            <p className="text-lg md:text-[20px] text-[#424245] leading-[1.45] tracking-[-0.01em] mb-10 max-w-[460px]">
              Tell us about your workload. We reply within one business day.
            </p>

            <div className="space-y-6 text-[14px] text-[#1d1d1f]">
              <div>
                <div className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[#6e6e73] mb-1.5">
                  Email
                </div>
                <a
                  href="mailto:info@getnadir.com"
                  className="inline-flex items-center gap-2 text-[#1d1d1f] no-underline hover:text-[#0071e3] transition-colors"
                >
                  <Mail className="h-4 w-4" />
                  info@getnadir.com
                </a>
              </div>
              <div>
                <div className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[#6e6e73] mb-1.5">
                  Support
                </div>
                <p className="text-[#424245] leading-[1.55] m-0">
                  Already on Nadir? Open a ticket from{" "}
                  <Link to="/dashboard/help" className="text-[#0071e3] hover:underline">
                    Help &amp; support
                  </Link>
                  .
                </p>
              </div>
              <div>
                <div className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[#6e6e73] mb-1.5">
                  Self-serve
                </div>
                <p className="text-[#424245] leading-[1.55] m-0">
                  Want to try first?{" "}
                  <Link to="/auth?mode=signup" className="text-[#0071e3] hover:underline">
                    Create an account
                  </Link>{" "}
                  or browse{" "}
                  <Link to="/pricing" className="text-[#0071e3] hover:underline">
                    pricing
                  </Link>
                  .
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white border border-black/[0.08] rounded-2xl p-6 md:p-8 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
            {sent ? (
              <div className="py-10 text-center">
                <div className="w-12 h-12 bg-[#e8f5ed] rounded-full flex items-center justify-center mx-auto mb-4">
                  <Check className="w-6 h-6 text-[#028a3e]" />
                </div>
                <p className="font-semibold text-[20px] text-[#1d1d1f] mb-1.5 tracking-[-0.01em]">
                  Message sent.
                </p>
                <p className="text-[14px] text-[#86868b] leading-[1.55]">
                  We'll be in touch shortly. Keep an eye on your inbox.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="contact-name">Name</Label>
                    <Input
                      id="contact-name"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Jane Doe"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="contact-company">Company</Label>
                    <Input
                      id="contact-company"
                      value={company}
                      onChange={(e) => setCompany(e.target.value)}
                      placeholder="Acme Inc."
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="contact-email">Work email</Label>
                  <Input
                    id="contact-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="contact-reason">What's this about?</Label>
                  <select
                    id="contact-reason"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    {REASONS.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="contact-message">How can we help?</Label>
                  <Textarea
                    id="contact-message"
                    required
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Team size, monthly LLM spend, what you're looking for."
                    rows={5}
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full rounded-full bg-[#1d1d1f] hover:bg-[#333] text-white"
                  disabled={loading}
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  Send message
                </Button>
                <p className="text-[12px] text-[#86868b] text-center leading-[1.5] tracking-[-0.005em]">
                  By submitting, you agree to our{" "}
                  <Link to="/terms" className="underline hover:text-[#1d1d1f]">
                    Terms
                  </Link>{" "}
                  and{" "}
                  <Link to="/privacy" className="underline hover:text-[#1d1d1f]">
                    Privacy Policy
                  </Link>
                  .
                </p>
              </form>
            )}
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}
