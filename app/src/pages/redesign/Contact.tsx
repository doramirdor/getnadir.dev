/**
 * Nadir blueprint redesign — Contact / Design partners (/contact).
 * Reuses the Supabase contact_submissions insert.
 */
import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { RedesignLayout, PageHero, Section, Panel } from "@/components/brand/redesign";
import { CompassBurst, Sparkle, VerifierSeal } from "@/components/brand/motifs";

const PARTNER_PERKS = [
  { k: "Founder access", v: "A direct line to the people building the router. No support tier in between." },
  { k: "White-glove onboarding", v: "We wire Nadir into your stack with you and tune routing to your traffic." },
  { k: "Locked-in pricing", v: "Early terms that hold as you scale. Your rate doesn't move when ours does." },
  { k: "Ship-first", v: "Your workload shapes the roadmap. The features you need get built first." },
];

export default function Contact() {
  const [params] = useSearchParams();
  const isPartner = (params.get("reason") || "sales") === "partner";
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [reason, setReason] = useState(isPartner ? "partner" : "sales");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErr(null);
    try {
      const { error } = await supabase.from("contact_submissions").insert({
        name: name.trim() || null,
        email: email.trim(),
        company: company.trim() || null,
        message: message.trim() || null,
        metadata: { reason },
      });
      if (error) throw error;
      setSent(true);
    } catch {
      setErr("Something went wrong. Please email info@getnadir.com.");
    } finally {
      setLoading(false);
    }
  };

  const field = "w-full rounded-[6px] border border-[var(--line)] bg-[var(--paper)] px-3.5 py-2.5 text-[14px] text-[var(--ink)] outline-none placeholder:text-[var(--ink)]/35 focus:border-[var(--terracotta)]";

  return (
    <RedesignLayout
      title={isPartner ? "Nadir · Become a design partner" : "Nadir · Contact"}
      description={isPartner ? "Work directly with the team building Nadir: founder access, white-glove onboarding, locked-in pricing, and a roadmap shaped by your workload." : "Tell us about your workload. We read every email and reply within a business day."}
      path="/contact"
      track="brand_redesign_contact"
    >
      <PageHero
        eyebrow={isPartner ? "Design partners" : "Contact"}
        title={isPartner ? "Build the router" : "Tell us about"}
        accent={isPartner ? "with us." : "your workload."}
        sub={isPartner
          ? <>A handful of teams shape Nadir from the inside. Founder access, white-glove onboarding, pricing that holds as you scale, and a roadmap driven by what you actually run.</>
          : <>Bigger spend, custom routing models, SSO/SAML, on-prem, an unusual integration. We read every email and reply within a business day.</>}
        hand={isPartner ? "a few seats, by hand" : "we reply within a day"}
        motif={<VerifierSeal className="seal-spin h-44 w-44 opacity-90" color="var(--ink)" />}
      />

      <Section rule={false}>
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-[0.9fr_1.1fr]">
          {/* left: perks or pitch */}
          <div>
            {isPartner ? (
              <ul className="space-y-6">
                {PARTNER_PERKS.map((p) => (
                  <li key={p.k} className="flex items-start gap-3">
                    <CompassBurst className="mt-1 h-4 w-4 shrink-0" color="var(--terracotta)" />
                    <div>
                      <h3 className="font-editorial text-[20px] text-[var(--ink)]">{p.k}</h3>
                      <p className="mt-1.5 max-w-sm text-[13.5px] leading-relaxed text-[var(--ink)]/65">{p.v}</p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div>
                <p className="max-w-sm text-[15px] leading-relaxed text-[var(--ink)]/70">
                  Prefer email? Reach us at <a href="mailto:info@getnadir.com" className="text-[var(--terracotta)] underline underline-offset-2">info@getnadir.com</a>. For a faster answer, the more you can tell us about team size and monthly LLM spend, the better.
                </p>
                <Sparkle className="mt-8 h-6 w-6" color="var(--strawberry)" />
              </div>
            )}
          </div>

          {/* right: form */}
          <Panel className="p-7">
            {sent ? (
              <div className="grid place-items-center py-10 text-center">
                <CompassBurst animate className="h-10 w-10" color="var(--terracotta)" />
                <h3 className="mt-4 font-editorial text-[26px] text-[var(--ink)]">Got it. Talk soon.</h3>
                <p className="mt-2 max-w-xs text-[14px] text-[var(--ink)]/65">We'll reply within a business day at the address you gave us.</p>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className="eyebrow text-[var(--ink)]/60">Name</span>
                    <input className={`mt-1.5 ${field}`} value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Doe" />
                  </label>
                  <label className="block">
                    <span className="eyebrow text-[var(--ink)]/60">Company</span>
                    <input className={`mt-1.5 ${field}`} value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Acme Inc." />
                  </label>
                </div>
                <label className="block">
                  <span className="eyebrow text-[var(--ink)]/60">Work email</span>
                  <input required type="email" className={`mt-1.5 ${field}`} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" />
                </label>
                <label className="block">
                  <span className="eyebrow text-[var(--ink)]/60">What's this about?</span>
                  <select className={`mt-1.5 ${field}`} value={reason} onChange={(e) => setReason(e.target.value)}>
                    <option value="sales">Talk to the team</option>
                    <option value="partner">Become a design partner</option>
                    <option value="support">Support</option>
                    <option value="enterprise">Enterprise / on-prem</option>
                  </select>
                </label>
                <label className="block">
                  <span className="eyebrow text-[var(--ink)]/60">Message</span>
                  <textarea className={`mt-1.5 ${field} min-h-[120px] resize-y`} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Team size, monthly LLM spend, what you're looking for." />
                </label>
                {err && <p className="font-mono text-[12px] text-[var(--terracotta)]">{err}</p>}
                <button type="submit" disabled={loading} className="btn-rect press disabled:opacity-60">
                  {loading ? "Sending…" : isPartner ? "Apply to partner" : "Send message"} <Sparkle className="twinkle h-3 w-3" color="var(--shell)" />
                </button>
              </form>
            )}
          </Panel>
        </div>
      </Section>
    </RedesignLayout>
  );
}
