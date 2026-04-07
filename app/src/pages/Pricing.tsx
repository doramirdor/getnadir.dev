import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Check, Loader2 } from "lucide-react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { SEO } from "@/components/SEO";
import { WaitlistForm } from "@/components/WaitlistForm";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { trackPricingView } from "@/utils/analytics";

const tiers = [
  {
    name: "Open Source",
    price: "Free",
    subtitle: "Self-hosted",
    description: "Run Nadir on your own infrastructure. Full routing + optimization.",
    features: [
      "Intelligent 4-tier routing",
      "Context Optimize (safe mode)",
      "CLI dashboard & analytics",
      "Unlimited requests",
      "MIT licensed",
    ],
    cta: "Get Started",
    ctaLink: "https://github.com/NadirRouter/NadirClaw",
    highlighted: false,
  },
  {
    name: "Pro",
    price: "$9",
    subtitle: "/month + up to 25% of savings",
    description: "Hosted proxy with zero setup. We only earn when we save you money.",
    features: [
      "Everything in Open Source",
      "Hosted proxy (api.getnadir.com)",
      "Aggressive semantic dedup",
      "Web dashboard & analytics",
      "BYOK or use our keys",
      "Up to 25% of savings (10% above $2K)",
      "Email support",
    ],
    cta: "waitlist",
    ctaLink: "",
    highlighted: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    subtitle: "volume pricing",
    description: "Dedicated infrastructure, SLA, and custom routing models.",
    features: [
      "Everything in Pro",
      "SSO / SAML",
      "Custom routing models",
      "Dedicated infrastructure",
      "99.9% SLA",
      "Priority support",
      "Audit logs & compliance",
    ],
    cta: "contact",
    ctaLink: "",
    highlighted: false,
  },
];

function ContactFormDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.from("contact_submissions").insert({
        name: name.trim(),
        email: email.trim(),
        company: company.trim() || null,
        message: message.trim(),
      });
      if (error) throw error;
      setSent(true);
      toast({ title: "Sent", description: "We'll be in touch shortly." });
      import("@/utils/analytics").then(a => a.trackContactSubmit());
    } catch {
      toast({ variant: "destructive", title: "Error", description: "Something went wrong. Please try again." });
    } finally {
      setLoading(false);
    }
  };

  const handleClose = (v: boolean) => {
    if (!v) {
      setSent(false);
      setName("");
      setEmail("");
      setCompany("");
      setMessage("");
    }
    onOpenChange(v);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Contact our team</DialogTitle>
          <DialogDescription>
            Tell us about your use case and we'll get back to you within 24 hours.
          </DialogDescription>
        </DialogHeader>
        {sent ? (
          <div className="py-8 text-center">
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <Check className="w-6 h-6 text-green-600" />
            </div>
            <p className="font-semibold text-lg">Message sent!</p>
            <p className="text-sm text-muted-foreground mt-1">We'll be in touch shortly.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 mt-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="contact-name">Name</Label>
                <Input id="contact-name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Doe" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="contact-company">Company</Label>
                <Input id="contact-company" value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Acme Inc." />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="contact-email">Email</Label>
              <Input id="contact-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="contact-message">How can we help?</Label>
              <Textarea id="contact-message" required value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Tell us about your team size, monthly LLM spend, and what you're looking for..." rows={4} />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Send Message
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function SavingsCalculator() {
  const [spend, setSpend] = useState(5000);
  const savingsRate = 0.38;
  const savings = spend * savingsRate;
  const feeOnFirst2K = Math.min(savings, 2000) * 0.25;
  const feeAbove2K = Math.max(savings - 2000, 0) * 0.10;
  const baseFee = 9;
  const totalFee = baseFee + feeOnFirst2K + feeAbove2K;
  const netSavings = savings - totalFee;

  return (
    <div className="max-w-2xl mx-auto mt-20 p-8 bg-gray-50 rounded-2xl">
      <h3 className="text-2xl font-bold text-center mb-2">Calculate your savings</h3>
      <p className="text-gray-500 text-center mb-8">
        Based on 30-60% cost reduction from intelligent routing benchmark (38% average)
      </p>

      <label className="block text-sm font-medium text-gray-700 mb-2">
        Monthly LLM spend: <span className="text-blue-600 font-bold">${spend.toLocaleString()}</span>
      </label>
      <input
        type="range"
        min={100}
        max={50000}
        step={100}
        value={spend}
        onChange={(e) => setSpend(Number(e.target.value))}
        className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600 mb-8"
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
        <div className="p-4 bg-white rounded-xl">
          <div className="text-sm text-gray-500">Without Nadir</div>
          <div className="text-xl font-bold">${spend.toLocaleString()}</div>
        </div>
        <div className="p-4 bg-white rounded-xl">
          <div className="text-sm text-gray-500">With Nadir</div>
          <div className="text-xl font-bold text-blue-600">
            ${Math.round(spend - savings).toLocaleString()}
          </div>
        </div>
        <div className="p-4 bg-white rounded-xl">
          <div className="text-sm text-gray-500">Nadir fee</div>
          <div className="text-xl font-bold">${Math.round(totalFee).toLocaleString()}</div>
        </div>
        <div className="p-4 bg-green-50 rounded-xl border border-green-200">
          <div className="text-sm text-green-700">You save</div>
          <div className="text-xl font-bold text-green-600">
            ${Math.round(netSavings).toLocaleString()}/mo
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Pricing() {
  const [contactOpen, setContactOpen] = useState(false);

  useEffect(() => { trackPricingView(); }, []);

  return (
    <MarketingLayout>
      <SEO
        title="Pricing - Nadir | Free Self-Hosted + Pro Plans"
        description="Self-host Nadir free or upgrade to Pro with advanced routing algorithms. Pay only when we save you money."
        path="/pricing"
      />
      {/* Hero */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-12 sm:pt-20 pb-10 sm:pb-16 text-center">
        <h1 className="text-3xl sm:text-5xl font-bold tracking-tight mb-4">
          Free to self-host. Pro when you need it.
        </h1>
        <p className="text-base sm:text-xl text-gray-500 max-w-2xl mx-auto">
          Self-host Nadir for free with full routing and optimization. Or use our hosted Pro plan - you only pay when we save you money.
        </p>
      </section>

      {/* Benchmark social proof */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-16">
        <div className="grid md:grid-cols-3 gap-6 max-w-3xl mx-auto">
          <div className="text-center p-6 bg-gray-50 rounded-xl">
            <div className="text-3xl font-bold text-[#00a86b] mb-1">30-60%</div>
            <div className="text-sm text-gray-500">cost savings</div>
          </div>
          <div className="text-center p-6 bg-gray-50 rounded-xl">
            <div className="text-4xl font-bold text-blue-600 mb-1">96%</div>
            <div className="text-sm text-gray-500">routing accuracy</div>
          </div>
          <div className="text-center p-6 bg-gray-50 rounded-xl">
            <div className="text-4xl font-bold text-indigo-500 mb-1">Zero</div>
            <div className="text-sm text-gray-500">latency overhead</div>
          </div>
        </div>
        <p className="text-center text-sm text-gray-400 mt-4">
          Benchmarked on real-world prompts with quality verified by LLM judge.
        </p>
      </section>

      {/* Tiers */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-20">
        <div className="grid md:grid-cols-3 gap-8">
          {tiers.map((tier) => (
            <div
              key={tier.name}
              className={`rounded-2xl p-8 flex flex-col ${
                tier.highlighted
                  ? "bg-gray-900 text-white ring-2 ring-blue-500 scale-105"
                  : "bg-gray-50 text-gray-900"
              }`}
            >
              <h3 className="text-lg font-semibold">{tier.name}</h3>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-4xl font-bold">{tier.price}</span>
                <span className={`text-sm ${tier.highlighted ? "text-gray-400" : "text-gray-500"}`}>
                  {tier.subtitle}
                </span>
              </div>
              <p className={`mt-4 text-sm ${tier.highlighted ? "text-gray-300" : "text-gray-500"}`}>
                {tier.description}
              </p>
              <ul className="mt-8 space-y-3 flex-1">
                {tier.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm">
                    <Check className={`h-4 w-4 mt-0.5 shrink-0 ${tier.highlighted ? "text-blue-400" : "text-blue-600"}`} />
                    {f}
                  </li>
                ))}
              </ul>
              {tier.cta === "waitlist" ? (
                <a
                  href="#waitlist"
                  className="mt-8 block text-center py-3 px-6 rounded-lg font-medium text-sm transition bg-blue-600 text-white hover:bg-blue-500"
                >
                  Join the Waitlist
                </a>
              ) : tier.cta === "contact" ? (
                <button
                  onClick={() => setContactOpen(true)}
                  className="mt-8 w-full text-center py-3 px-6 rounded-lg font-medium text-sm transition bg-white text-gray-900 border border-gray-200 hover:border-gray-400"
                >
                  Contact Us
                </button>
              ) : (
                <a
                  href={tier.ctaLink}
                  className={`mt-8 block text-center py-3 px-6 rounded-lg font-medium text-sm transition ${
                    tier.highlighted
                      ? "bg-blue-600 text-white hover:bg-blue-500"
                      : "bg-white text-gray-900 border border-gray-200 hover:border-gray-400"
                  }`}
                >
                  {tier.cta}
                </a>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Waitlist */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-16">
        <WaitlistForm variant="card" source="pricing" />
      </section>

      {/* Calculator */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-20">
        <SavingsCalculator />
      </section>

      {/* How it works */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 pb-20">
        <h2 className="text-2xl font-bold text-center mb-12">How savings-based pricing works</h2>
        <div className="space-y-6 text-gray-700">
          <div className="flex gap-4">
            <div className="flex-shrink-0 w-8 h-8 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-sm font-bold">1</div>
            <div>
              <div className="font-semibold text-gray-900">You set a benchmark model</div>
              <div className="text-sm text-gray-500">The model you'd normally use for everything (e.g., Claude Opus 4.6, GPT-4).</div>
            </div>
          </div>
          <div className="flex gap-4">
            <div className="flex-shrink-0 w-8 h-8 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-sm font-bold">2</div>
            <div>
              <div className="font-semibold text-gray-900">Nadir routes intelligently + compacts context</div>
              <div className="text-sm text-gray-500">Simple prompts go to cheaper models. Bloated context is trimmed. Complex tasks stay on premium models.</div>
            </div>
          </div>
          <div className="flex gap-4">
            <div className="flex-shrink-0 w-8 h-8 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-sm font-bold">3</div>
            <div>
              <div className="font-semibold text-gray-900">We calculate the difference</div>
              <div className="text-sm text-gray-500">Savings = what you would have paid - what you actually paid. Tracked per request, reported in your dashboard.</div>
            </div>
          </div>
          <div className="flex gap-4">
            <div className="flex-shrink-0 w-8 h-8 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-sm font-bold">4</div>
            <div>
              <div className="font-semibold text-gray-900">You keep 75% (or 90% above $2K)</div>
              <div className="text-sm text-gray-500">First $2K saved: 25% fee. Above $2K: drops to 10%. Plus $9/mo base to cover hosting.</div>
            </div>
          </div>
        </div>
      </section>

      <ContactFormDialog open={contactOpen} onOpenChange={setContactOpen} />
    </MarketingLayout>
  );
}
