// Centralized JSON-LD builders for structured data (schema.org).
//
// Search engines and AI answer engines (Google AI Overviews, Perplexity, etc.)
// lean heavily on structured data to extract facts and cite sources. These
// helpers keep our schema consistent across pages and easy to update in one
// place.

const SITE = "https://getnadir.com";

// Note: site-wide structured data (Organization, SoftwareApplication, FAQPage,
// WebSite, BreadcrumbList) already ships in the static index.html @graph that
// every prerendered page inherits. This builder covers only the per-page schema
// the base document cannot know about: per-article metadata. We intentionally
// do not emit a second BreadcrumbList per page, since the base one is inherited
// everywhere and two breadcrumb trails on one page hurt rather than help.

/** Build Article JSON-LD for a blog post. */
export const articleJsonLd = (args: {
  title: string;
  description: string;
  path: string;
  datePublished?: string;
  dateModified?: string;
  image?: string;
}) => ({
  "@context": "https://schema.org",
  "@type": "Article",
  headline: args.title,
  description: args.description,
  image: args.image ? `${SITE}${args.image}` : `${SITE}/og-image.png`,
  mainEntityOfPage: { "@type": "WebPage", "@id": `${SITE}${args.path}` },
  author: { "@type": "Organization", name: "Nadir", url: SITE },
  publisher: {
    "@type": "Organization",
    name: "Nadir",
    logo: { "@type": "ImageObject", url: `${SITE}/logo.png` },
  },
  ...(args.datePublished ? { datePublished: args.datePublished } : {}),
  ...(args.dateModified ? { dateModified: args.dateModified } : {}),
});
