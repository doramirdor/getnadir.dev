import { useEffect } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Check, X } from "lucide-react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { SEO } from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { CompareService, NADIR_PILLARS } from "@/services/compareService";
import { trackCtaClick, trackPageView } from "@/utils/analytics";

export default function Compare() {
  const { competitor } = useParams();
  const navigate = useNavigate();

  const all = CompareService.getAll();

  useEffect(() => {
    if (competitor) {
      trackPageView("compare_detail", { competitor });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      trackPageView("compare");
    }
  }, [competitor]);

  if (!competitor) {
    return (
      <MarketingLayout>
        <SEO
          title="Nadir vs alternatives | LLM router comparisons"
          description="Deep-dive comparisons between Nadir and OpenRouter, Requesty, LiteLLM, Not Diamond, and Portkey."
          path="/compare"
          jsonLd={{
            "@context": "https://schema.org",
            "@type": "ItemList",
            name: "Nadir vs alternatives",
            description:
              "Head-to-head deep dives between Nadir and every LLM gateway, router, and model recommender we get compared to.",
            itemListElement: all.map((p, i) => ({
              "@type": "ListItem",
              position: i + 1,
              url: `https://getnadir.com/compare/${p.slug}`,
              name: `Nadir vs ${p.competitor}`,
            })),
          }}
        />
        <div className="max-w-[1040px] mx-auto px-6 sm:px-8 py-16 md:py-24">
          <div className="mb-12">
            <h1 className="text-[40px] md:text-[56px] font-semibold tracking-[-0.034em] text-[#1d1d1f] leading-[1.05] mb-4">
              Nadir vs alternatives
            </h1>
            <p className="text-lg md:text-[21px] text-[#424245] leading-[1.4] tracking-[-0.01em] max-w-[720px]">
              Honest deep dives on every LLM gateway and router we get compared
              to. Updated as the products change.
            </p>
          </div>

          <section className="mb-16 bg-[#fbfbfd] border border-black/[0.06] rounded-3xl p-8 md:p-10">
            <div className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[#0071e3] mb-3">
              Why teams pick Nadir
            </div>
            <h2 className="text-[28px] md:text-[36px] font-semibold tracking-[-0.02em] text-[#1d1d1f] leading-[1.1] mb-3 max-w-[720px]">
              Six things Nadir does that gateways, catalogues, and recommenders
              do not.
            </h2>
            <p className="text-[15px] text-[#424245] leading-[1.6] max-w-[680px] mb-8">
              Pricing is the footnote. The moat is the decision engine: a
              trained classifier, a closed loop that adapts, privacy that
              survives an audit, and reliability you can point at in the code.
            </p>
            <div className="grid md:grid-cols-2 gap-4">
              {NADIR_PILLARS.map((pillar) => (
                <div
                  key={pillar.title}
                  className="bg-white border border-black/[0.06] rounded-2xl p-5"
                >
                  <div className="text-[16px] font-semibold text-[#1d1d1f] tracking-[-0.01em] mb-2">
                    {pillar.title}
                  </div>
                  <p className="text-[14px] text-[#424245] leading-[1.6] mb-3">
                    {pillar.body}
                  </p>
                  <div className="text-[12px] font-mono text-[#0071e3] leading-[1.5]">
                    {pillar.proof}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <div className="mb-6">
            <div className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[#6e6e73] mb-2">
              Head-to-head
            </div>
            <h2 className="text-[22px] font-semibold tracking-[-0.01em] text-[#1d1d1f]">
              Compared to every tool we get asked about
            </h2>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            {all.map((p) => (
              <Link
                key={p.slug}
                to={`/compare/${p.slug}`}
                className="block border border-black/[0.08] rounded-2xl p-6 hover:border-black/[0.2] transition-colors bg-white"
              >
                <div className="text-[12px] font-mono text-[#6e6e73] mb-2">
                  {p.category}
                </div>
                <div className="text-[22px] font-semibold text-[#1d1d1f] mb-2 tracking-[-0.02em]">
                  Nadir vs {p.competitor}
                </div>
                <p className="text-[14px] text-[#424245] leading-[1.55] mb-3">
                  {p.tagline}
                </p>
                <div className="text-[13px] text-[#0071e3] font-medium">
                  Read comparison &rarr;
                </div>
              </Link>
            ))}
          </div>
        </div>
      </MarketingLayout>
    );
  }

  const page = CompareService.get(competitor);

  if (!page) {
    return (
      <MarketingLayout>
        <div className="container mx-auto px-6 py-24 text-center">
          <h1 className="text-2xl font-semibold text-foreground mb-4">
            Comparison not found
          </h1>
          <Button onClick={() => navigate("/compare")} variant="outline">
            <ArrowLeft className="mr-2 h-4 w-4" />
            See all comparisons
          </Button>
        </div>
      </MarketingLayout>
    );
  }

  return (
    <MarketingLayout>
      <SEO
        title={`Nadir vs ${page.competitor} | Comparison`}
        description={page.tagline}
        path={`/compare/${page.slug}`}
        jsonLd={{
          "@context": "https://schema.org",
          "@type": "Article",
          headline: `Nadir vs ${page.competitor}`,
          description: page.tagline,
          about: [
            { "@type": "SoftwareApplication", name: "Nadir", url: "https://getnadir.com" },
            { "@type": "SoftwareApplication", name: page.competitor },
          ],
          author: { "@type": "Organization", name: "Nadir", url: "https://getnadir.com" },
          publisher: {
            "@type": "Organization",
            name: "Nadir",
            url: "https://getnadir.com",
            logo: { "@type": "ImageObject", url: "https://getnadir.com/logo.png" },
          },
          dateModified: page.updatedAt,
          mainEntityOfPage: `https://getnadir.com/compare/${page.slug}`,
        }}
      />

      <article className="max-w-[880px] mx-auto px-6 sm:px-8 py-10 md:py-16">
        <Link
          to="/compare"
          className="inline-flex items-center gap-2 text-[13px] text-[#6e6e73] hover:text-[#1d1d1f] mb-8"
        >
          <ArrowLeft className="h-4 w-4" />
          All comparisons
        </Link>

        <header className="mb-12 pb-10 border-b border-black/[0.08]">
          <div className="inline-block px-2.5 py-1 bg-[#0a0a0a] text-white text-[11px] font-mono rounded mb-5">
            {page.category}
          </div>
          <h1 className="text-[40px] md:text-[56px] font-semibold tracking-[-0.034em] text-[#1d1d1f] leading-[1.05] mb-5">
            Nadir vs {page.competitor}
          </h1>
          <p className="text-lg md:text-[22px] text-[#424245] leading-[1.4] tracking-[-0.01em] mb-4">
            {page.tagline}
          </p>
          <div className="flex flex-wrap items-center gap-3 text-[13px] text-[#6e6e73]">
            <span>Updated {page.updatedAt}</span>
            <span>&middot;</span>
            <span>{page.readingTime}</span>
          </div>
        </header>

        <section className="mb-12">
          <p className="text-[18px] text-[#1d1d1f] leading-[1.55] mb-6">
            {page.oneLiner}
          </p>

          <div className="bg-[#fbfbfd] border border-black/[0.06] rounded-2xl p-6">
            <div className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[#6e6e73] mb-3">
              TL;DR
            </div>
            <ul className="list-disc pl-5 space-y-2">
              {page.tldr.map((item, i) => (
                <li
                  key={i}
                  className="text-[15px] text-[#1d1d1f] leading-[1.55]"
                >
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="mb-12">
          <h2 className="text-[28px] md:text-[32px] font-semibold tracking-[-0.02em] text-[#1d1d1f] mb-4">
            Positioning
          </h2>
          <p className="text-[16px] text-[#424245] leading-[1.65]">
            {page.positioning}
          </p>
        </section>

        {page.keyAdvantages && page.keyAdvantages.length > 0 && (
          <section className="mb-12">
            <div className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[#0071e3] mb-3">
              Why Nadir, not {page.competitor}
            </div>
            <h2 className="text-[28px] md:text-[32px] font-semibold tracking-[-0.02em] text-[#1d1d1f] mb-6 max-w-[700px]">
              The technical reasons, before the pricing conversation.
            </h2>
            <div className="grid md:grid-cols-2 gap-4">
              {page.keyAdvantages.map((adv) => (
                <div
                  key={adv.title}
                  className="bg-white border border-black/[0.08] rounded-2xl p-6"
                >
                  <div className="flex items-start gap-2 mb-2">
                    <Check className="h-4 w-4 text-[#028a3e] mt-[5px] shrink-0" />
                    <div className="text-[17px] font-semibold text-[#1d1d1f] tracking-[-0.01em] leading-[1.3]">
                      {adv.title}
                    </div>
                  </div>
                  <p className="text-[14px] text-[#424245] leading-[1.6] mb-3">
                    {adv.body}
                  </p>
                  {adv.proof && (
                    <div className="text-[12px] font-mono text-[#0071e3] leading-[1.5] pt-3 border-t border-black/[0.05]">
                      {adv.proof}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="mb-12 grid md:grid-cols-2 gap-4">
          <div className="bg-white border border-black/[0.08] rounded-2xl p-6">
            <div className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[#6e6e73] mb-2">
              {page.competitor} pricing
            </div>
            <p className="text-[14px] text-[#1d1d1f] leading-[1.6] whitespace-pre-line">
              {page.theirPricing}
            </p>
          </div>
          <div className="bg-[rgba(0,113,227,0.04)] border border-[rgba(0,113,227,0.2)] rounded-2xl p-6">
            <div className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[#0071e3] mb-2">
              Nadir pricing
            </div>
            <p className="text-[14px] text-[#1d1d1f] leading-[1.6] whitespace-pre-line">
              {page.nadirPricing}
            </p>
          </div>
        </section>

        <section className="mb-12">
          <h2 className="text-[28px] md:text-[32px] font-semibold tracking-[-0.02em] text-[#1d1d1f] mb-5">
            Feature by feature
          </h2>
          <div className="border border-black/[0.08] rounded-2xl overflow-hidden">
            <table className="w-full text-[14px]">
              <thead>
                <tr className="bg-[#fbfbfd] border-b border-black/[0.06]">
                  <th className="text-left px-5 py-3 font-semibold text-[13px] text-[#1d1d1f]">
                    Feature
                  </th>
                  <th className="text-left px-5 py-3 font-semibold text-[13px] text-[#0071e3] bg-[rgba(0,113,227,0.04)]">
                    Nadir
                  </th>
                  <th className="text-left px-5 py-3 font-semibold text-[13px] text-[#1d1d1f]">
                    {page.competitor}
                  </th>
                </tr>
              </thead>
              <tbody>
                {page.table.map((row, i) => (
                  <tr
                    key={row.feature}
                    className={
                      i < page.table.length - 1
                        ? "border-b border-black/[0.05]"
                        : ""
                    }
                  >
                    <td className="px-5 py-4 text-[#1d1d1f] font-medium align-top">
                      {row.feature}
                    </td>
                    <td className="px-5 py-4 text-[#1d1d1f] bg-[rgba(0,113,227,0.02)] align-top">
                      {row.nadir}
                    </td>
                    <td className="px-5 py-4 text-[#424245] align-top">
                      {row.them}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {page.sections.map((s, i) => (
          <section key={i} className="mb-12">
            <h2 className="text-[28px] md:text-[32px] font-semibold tracking-[-0.02em] text-[#1d1d1f] mb-4">
              {s.heading}
            </h2>
            {s.body.split("\n\n").map((para, pi) => (
              <p
                key={pi}
                className="text-[16px] text-[#424245] leading-[1.7] mb-4"
              >
                {para}
              </p>
            ))}
          </section>
        ))}

        <section className="mb-12 grid md:grid-cols-2 gap-4">
          <div className="bg-white border border-black/[0.08] rounded-2xl p-6">
            <div className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[#6e6e73] mb-3">
              Pick {page.competitor} when
            </div>
            <ul className="space-y-2.5">
              {page.whenToPickThem.map((item, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2 text-[14px] text-[#1d1d1f] leading-[1.5]"
                >
                  <X className="h-4 w-4 text-[#86868b] mt-[3px] shrink-0" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="bg-[rgba(0,113,227,0.04)] border border-[rgba(0,113,227,0.2)] rounded-2xl p-6">
            <div className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[#0071e3] mb-3">
              Pick Nadir when
            </div>
            <ul className="space-y-2.5">
              {page.whenToPickNadir.map((item, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2 text-[14px] text-[#1d1d1f] leading-[1.5]"
                >
                  <Check className="h-4 w-4 text-[#028a3e] mt-[3px] shrink-0" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="mb-12">
          <div className="bg-[#fbfbfd] border border-black/[0.08] rounded-2xl p-6">
            <div className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[#6e6e73] mb-2">
              Verdict
            </div>
            <p className="text-[16px] text-[#1d1d1f] leading-[1.65]">
              {page.verdict}
            </p>
          </div>
        </section>

        <section className="bg-[#0a0a0a] text-white rounded-2xl p-10 text-center">
          <h3 className="text-[28px] font-semibold tracking-[-0.02em] mb-3">
            Put the classifier on your traffic
          </h3>
          <p className="text-[15px] text-white/70 mb-6 max-w-[560px] mx-auto leading-[1.55]">
            Swap your base URL, set model to auto. The classifier picks the
            tier, OCR keeps it honest as models change, and the savings
            dashboard shows routed cost versus always-Opus per request. BYOK.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Button
              onClick={() => {
                trackCtaClick("get_started_free", `compare_${page.slug}`);
                navigate("/auth");
              }}
              size="lg"
              className="bg-white text-black hover:bg-white/90"
            >
              Get started free
            </Button>
            <Button
              onClick={() => {
                trackCtaClick("see_pricing", `compare_${page.slug}`);
                navigate("/pricing");
              }}
              size="lg"
              variant="outline"
              className="bg-transparent border-white/20 text-white hover:bg-white/10 hover:text-white"
            >
              See pricing
            </Button>
          </div>
        </section>

        <div className="mt-16 pt-10 border-t border-black/[0.08]">
          <div className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[#6e6e73] mb-4">
            More comparisons
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            {all
              .filter((p) => p.slug !== page.slug)
              .map((p) => (
                <Link
                  key={p.slug}
                  to={`/compare/${p.slug}`}
                  className="block border border-black/[0.08] rounded-xl p-4 hover:border-black/[0.2] transition-colors"
                >
                  <div className="text-[15px] font-semibold text-[#1d1d1f] mb-1">
                    Nadir vs {p.competitor}
                  </div>
                  <div className="text-[13px] text-[#6e6e73] leading-[1.5]">
                    {p.tagline}
                  </div>
                </Link>
              ))}
          </div>
        </div>
      </article>
    </MarketingLayout>
  );
}
