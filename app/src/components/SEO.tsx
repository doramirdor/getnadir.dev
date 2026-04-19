import { useEffect } from "react";

interface SEOProps {
  title: string;
  description: string;
  path?: string;
  jsonLd?: Record<string, unknown> | Record<string, unknown>[];
}

const BASE_URL = "https://getnadir.com";
const JSON_LD_ID = "seo-page-jsonld";

export const SEO = ({ title, description, path = "/", jsonLd }: SEOProps) => {
  useEffect(() => {
    document.title = title;

    const setMeta = (attr: string, key: string, content: string) => {
      let el = document.querySelector(`meta[${attr}="${key}"]`) as HTMLMetaElement | null;
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute(attr, key);
        document.head.appendChild(el);
      }
      el.setAttribute("content", content);
    };

    const url = `${BASE_URL}${path}`;

    setMeta("name", "description", description);
    setMeta("property", "og:title", title);
    setMeta("property", "og:description", description);
    setMeta("property", "og:url", url);
    setMeta("name", "twitter:title", title);
    setMeta("name", "twitter:description", description);

    let canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (canonical) canonical.href = url;

    const existing = document.getElementById(JSON_LD_ID);
    if (jsonLd) {
      const tag = (existing as HTMLScriptElement | null) ?? document.createElement("script");
      tag.setAttribute("type", "application/ld+json");
      tag.id = JSON_LD_ID;
      tag.textContent = JSON.stringify(jsonLd);
      if (!existing) document.head.appendChild(tag);
    } else if (existing) {
      existing.remove();
    }

    return () => {
      const tag = document.getElementById(JSON_LD_ID);
      if (tag) tag.remove();
    };
  }, [title, description, path, jsonLd]);

  return null;
};
