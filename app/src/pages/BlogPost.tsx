import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Clock, Calendar, User, Tag, Copy, Check } from "lucide-react";
import React, { useEffect, useState, useMemo } from "react";
import { BlogService } from "@/services/blogService";
import { RedesignLayout } from "@/components/brand/redesign";
import { SEO } from "@/components/SEO";
import { trackBlogRead } from "@/utils/analytics";
import hljs from "highlight.js/lib/core";
import python from "highlight.js/lib/languages/python";
import javascript from "highlight.js/lib/languages/javascript";
import typescript from "highlight.js/lib/languages/typescript";
import bash from "highlight.js/lib/languages/bash";
import json from "highlight.js/lib/languages/json";
import yaml from "highlight.js/lib/languages/yaml";
import http from "highlight.js/lib/languages/http";
import xml from "highlight.js/lib/languages/xml";

// Register only the languages we expect in posts to keep the bundle lean.
hljs.registerLanguage("python", python);
hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("bash", bash);
hljs.registerLanguage("json", json);
hljs.registerLanguage("yaml", yaml);
hljs.registerLanguage("http", http);
hljs.registerLanguage("xml", xml);

// Map common fence labels (```py, ```sh, ...) to a registered language.
const CODE_LANGS: Record<string, string> = {
  py: "python",
  python: "python",
  js: "javascript",
  javascript: "javascript",
  jsx: "javascript",
  node: "javascript",
  ts: "typescript",
  typescript: "typescript",
  tsx: "typescript",
  sh: "bash",
  bash: "bash",
  shell: "bash",
  zsh: "bash",
  console: "bash",
  curl: "bash",
  json: "json",
  yaml: "yaml",
  yml: "yaml",
  http: "http",
  html: "xml",
  xml: "xml",
};

function CodeBlock({ code, lang }: { code: string; lang?: string }) {
  const [copied, setCopied] = useState(false);

  // Syntax-highlight to an HTML string. Use the declared language when known,
  // otherwise let highlight.js auto-detect among the registered set. Falls back
  // to plain text if highlighting throws.
  const highlighted = useMemo(() => {
    const normalized = CODE_LANGS[(lang || "").trim().toLowerCase()];
    try {
      return normalized
        ? hljs.highlight(code, { language: normalized }).value
        : hljs.highlightAuto(code).value;
    } catch {
      return null;
    }
  }, [code, lang]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable, no-op */
    }
  };

  return (
    <div className="not-prose group relative my-6 overflow-hidden rounded-xl border border-black/10 bg-[#1d1d1f]">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-2">
        <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-white/40">
          {lang || "code"}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          aria-label="Copy code"
          className="inline-flex items-center gap-1.5 text-[11px] font-medium text-white/50 transition-colors hover:text-white"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto px-4 py-4 text-[13px] leading-relaxed">
        {highlighted ? (
          <code
            className="hljs whitespace-pre bg-transparent p-0 font-mono"
            dangerouslySetInnerHTML={{ __html: highlighted }}
          />
        ) : (
          <code className="whitespace-pre font-mono text-[#f5f5f7]">{code}</code>
        )}
      </pre>
    </div>
  );
}

export default function BlogPost() {
  const { id } = useParams();
  const navigate = useNavigate();

  const post = BlogService.getPostById(id || "");

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
    if (post) trackBlogRead(post.id, post.title);
  }, [id]);

  if (!post) {
    return (
      <MarketingLayout>
        <div className="container mx-auto px-6 py-24 text-center">
          <h1 className="text-2xl font-semibold text-foreground mb-4">
            Post not found
          </h1>
          <Button onClick={() => navigate("/")} variant="outline">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Home
          </Button>
        </div>
      </MarketingLayout>
    );
  }

  const renderProse = (text: string) => {
    const paragraphs = text.split("\n\n");

    return paragraphs
      .map((paragraph, index) => {
        const trimmed = paragraph.trim();
        if (!trimmed) return null;

        if (/^-{3,}$/.test(trimmed)) {
          return (
            <hr
              key={index}
              className="my-10 border-0 h-px bg-border"
            />
          );
        }

        if (/^!\[([^\]]*)\]\(([^)]+)\)$/.test(trimmed)) {
          const imgMatch = /^!\[([^\]]*)\]\(([^)]+)\)$/.exec(trimmed);
          if (imgMatch) {
            const [, alt, src] = imgMatch;
            return (
              <figure key={index} className="my-8">
                <img
                  src={src}
                  alt={alt}
                  className="w-full rounded-xl border border-border shadow-sm"
                  loading="lazy"
                />
                {alt && (
                  <figcaption className="mt-2 text-center text-sm text-muted-foreground italic">
                    {alt}
                  </figcaption>
                )}
              </figure>
            );
          }
        }

        if (trimmed.startsWith("### ")) {
          return (
            <h3
              key={index}
              className="text-xl font-semibold text-foreground mt-6 mb-3"
            >
              {formatInline(trimmed.replace("### ", ""))}
            </h3>
          );
        }
        if (trimmed.startsWith("## ")) {
          return (
            <h2
              key={index}
              className="text-2xl font-semibold text-foreground mt-8 mb-4"
            >
              {formatInline(trimmed.replace("## ", ""))}
            </h2>
          );
        }

        if (trimmed.includes("| ") && trimmed.includes(" |")) {
          const lines = trimmed.split("\n").filter((l) => l.trim());
          if (lines.length > 2) {
            const headers = lines[0]
              .split("|")
              .map((c) => c.trim())
              .filter(Boolean);
            const rows = lines.slice(2).map((line) =>
              line
                .split("|")
                .map((c) => c.trim())
                .filter(Boolean)
            );
            if (headers.length > 0 && rows.length > 0) {
              return (
                <div key={index} className="overflow-x-auto my-6">
                  <table className="w-full border-collapse border border-border rounded-lg">
                    <thead>
                      <tr className="bg-muted">
                        {headers.map((h, i) => (
                          <th
                            key={i}
                            className="border border-border px-4 py-2 text-left font-semibold"
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row, ri) => (
                        <tr key={ri} className="hover:bg-muted/50">
                          {row.map((cell, ci) => (
                            <td
                              key={ci}
                              className="border border-border px-4 py-2"
                            >
                              {formatInline(cell)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            }
          }
        }

        if (
          trimmed.includes("- **") ||
          trimmed.startsWith("- ") ||
          trimmed.startsWith("* ")
        ) {
          const lines = trimmed.split("\n").filter((l) => l.trim());
          const listItems = lines.filter((l) => {
            const t = l.trim();
            return t.startsWith("- ") || t.startsWith("* ");
          });
          if (listItems.length > 0) {
            return (
              <ul key={index} className="list-disc list-inside space-y-2 my-4">
                {listItems.map((item, i) => {
                  const clean = item.replace(/^[-*]\s/, "").trim();
                  return (
                    <li key={i} className="text-muted-foreground">
                      {formatInline(clean)}
                    </li>
                  );
                })}
              </ul>
            );
          }
        }

        if (/^\d+\./.test(trimmed)) {
          const lines = trimmed.split("\n").filter((l) => l.trim());
          const listItems = lines.filter((l) => /^\d+\./.test(l.trim()));
          if (listItems.length > 0) {
            return (
              <ol
                key={index}
                className="list-decimal list-inside space-y-2 my-4"
              >
                {listItems.map((item, i) => {
                  const clean = item.replace(/^\d+\.\s/, "").trim();
                  return (
                    <li key={i} className="text-muted-foreground">
                      {formatInline(clean)}
                    </li>
                  );
                })}
              </ol>
            );
          }
        }

        return (
          <p
            key={index}
            className="text-muted-foreground leading-relaxed mb-6"
          >
            {formatInline(trimmed)}
          </p>
        );
      })
      .filter(Boolean);
  };

  const processContent = (content: string) => {
    if (!content || content.trim() === "") {
      return [
        <p key="no-content" className="text-muted-foreground">
          Content is being loaded...
        </p>,
      ];
    }

    // Split the content into fenced code blocks (```) and prose. Code fences
    // are handled before the paragraph split because a code block can contain
    // blank lines, which the prose renderer treats as paragraph breaks.
    const lines = content.split("\n");
    const nodes: React.ReactNode[] = [];
    let buffer: string[] = [];
    let blockIdx = 0;

    const flushProse = () => {
      if (buffer.join("\n").trim()) {
        renderProse(buffer.join("\n")).forEach((node, idx) => {
          nodes.push(
            React.isValidElement(node)
              ? React.cloneElement(node, { key: `prose-${blockIdx}-${idx}` })
              : node
          );
        });
      }
      buffer = [];
      blockIdx += 1;
    };

    let i = 0;
    while (i < lines.length) {
      if (/^\s*```/.test(lines[i])) {
        flushProse();
        const lang = lines[i].replace(/^\s*```/, "").trim();
        i += 1;
        const codeLines: string[] = [];
        while (i < lines.length && !/^\s*```/.test(lines[i])) {
          codeLines.push(lines[i]);
          i += 1;
        }
        i += 1; // consume the closing fence
        nodes.push(
          <CodeBlock
            key={`code-${blockIdx}`}
            code={codeLines.join("\n")}
            lang={lang}
          />
        );
        blockIdx += 1;
      } else {
        buffer.push(lines[i]);
        i += 1;
      }
    }
    flushProse();

    return nodes;
  };

  const formatInline = (text: string): React.ReactNode[] => {
    // Tokenizer for inline markdown: links, bold, italic, inline code.
    // Order matters: links first (to avoid * inside link text being parsed as italic),
    // then bold (**) before italic (*) so ** wins.
    const pattern =
      /(\[[^\]]+\]\([^)]+\))|(\*\*[^*]+\*\*)|(`[^`]+`)|(\*[^*\n]+\*)/g;
    const nodes: React.ReactNode[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    let key = 0;

    while ((match = pattern.exec(text)) !== null) {
      if (match.index > lastIndex) {
        nodes.push(text.slice(lastIndex, match.index));
      }
      const token = match[0];

      if (token.startsWith("[") && token.includes("](")) {
        const linkMatch = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token);
        if (linkMatch) {
          const [, label, href] = linkMatch;
          const isExternal = /^https?:\/\//.test(href);
          nodes.push(
            <a
              key={key++}
              href={href}
              {...(isExternal
                ? { target: "_blank", rel: "noopener noreferrer" }
                : {})}
              className="text-[#028a3e] underline underline-offset-2 decoration-[#028a3e]/40 hover:decoration-[#028a3e] transition-colors"
            >
              {label}
            </a>
          );
        } else {
          nodes.push(token);
        }
      } else if (token.startsWith("**") && token.endsWith("**")) {
        nodes.push(
          <strong key={key++} className="font-bold text-foreground">
            {token.slice(2, -2)}
          </strong>
        );
      } else if (token.startsWith("`") && token.endsWith("`")) {
        nodes.push(
          <code
            key={key++}
            className="px-1.5 py-0.5 rounded bg-muted text-foreground text-[0.9em] font-mono"
          >
            {token.slice(1, -1)}
          </code>
        );
      } else if (token.startsWith("*") && token.endsWith("*")) {
        nodes.push(
          <em key={key++} className="italic">
            {formatInline(token.slice(1, -1))}
          </em>
        );
      } else {
        nodes.push(token);
      }

      lastIndex = match.index + token.length;
    }

    if (lastIndex < text.length) {
      nodes.push(text.slice(lastIndex));
    }

    return nodes;
  };

  return (
    <RedesignLayout
      title={`${post.title.slice(0, 64)} · Nadir`}
      description={post.excerpt}
      path={`/blog/${post.id}`}
    >
      <div className="mx-auto max-w-[840px] px-6 pb-20 pt-12 lg:px-10">
        <button
          onClick={() => navigate("/blog")}
          className="mb-8 inline-flex items-center gap-1.5 eyebrow text-[var(--ink)]/55 transition-colors hover:text-[var(--strawberry)]"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> All posts
        </button>

        <article className="brand-prose">
          {/* Header */}
          <header className="mb-10 border-b border-[var(--line)] pb-8">
            <span className="eyebrow text-[var(--strawberry)]">{post.thumbnail}</span>
            <h1 className="mt-4 font-editorial text-[clamp(32px,5vw,54px)] font-semibold leading-[1.04] text-[var(--ink)] [text-wrap:balance]">
              {post.title}
            </h1>
            <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-1.5 font-mono text-[12px] text-[var(--ink)]/55">
              <span className="inline-flex items-center gap-1.5"><User className="h-3.5 w-3.5" />{post.author}</span>
              <span className="inline-flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" />{BlogService.formatDate(post.date)}</span>
              <span className="inline-flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" />{post.readingTime}</span>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {post.tags.map((tag) => (
                <span key={tag} className="inline-flex items-center gap-1 rounded-full border border-[var(--line)] px-2.5 py-1 font-mono text-[11px] text-[var(--ink)]/60">
                  <Tag className="h-3 w-3" />{tag}
                </span>
              ))}
            </div>
            <p className="mt-5 font-editorial text-[18px] italic leading-relaxed text-[var(--ink)]/70">{post.excerpt}</p>
          </header>

          {/* Content */}
          <div className="prose prose-lg max-w-none leading-relaxed space-y-2 text-[var(--ink)]/85">
            {processContent(post.content)}
          </div>

          {/* CTA */}
          <div className="ink-frame mt-14 bg-[var(--paper)] p-9 text-center">
            <span className="eyebrow text-[var(--strawberry)]">Done reading?</span>
            <h3 className="mt-3 font-editorial text-[clamp(26px,3.4vw,38px)] leading-tight text-[var(--ink)]">Put it to work on your traffic.</h3>
            <p className="mx-auto mt-3 max-w-[520px] text-[15px] leading-relaxed text-[var(--ink)]/65">
              Two lines of code, one base URL. The savings dashboard shows the real delta against always-Opus, per request.
            </p>
            <button onClick={() => navigate("/auth?mode=signup")} className="btn-rect press mt-7">Bring your own keys</button>
          </div>
        </article>
      </div>
    </RedesignLayout>
  );
}
