import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Clock, Calendar, User, Tag } from "lucide-react";
import React, { useEffect } from "react";
import { BlogService } from "@/services/blogService";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { SEO } from "@/components/SEO";
import { trackBlogRead } from "@/utils/analytics";

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

  const processContent = (content: string) => {
    if (!content || content.trim() === "") {
      return [
        <p key="no-content" className="text-muted-foreground">
          Content is being loaded...
        </p>,
      ];
    }

    const paragraphs = content.split("\n\n");

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
    <MarketingLayout>
      <SEO
        title={`${post.title} - Nadir Blog`}
        description={post.excerpt}
        path={`/blog/${post.id}`}
      />
      <div className="container mx-auto px-6 py-8">
        <Button
          variant="ghost"
          className="mb-8 hover:bg-muted text-[#028a3e]"
          onClick={() => navigate("/blog")}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          All posts
        </Button>

        <article className="max-w-4xl mx-auto">
          {/* Header */}
          <header className="text-center mb-12 border-b border-border pb-8">
            <div className="inline-block px-3 py-1 bg-[rgba(48,209,88,0.10)] text-[#028a3e] text-[12px] font-semibold uppercase tracking-[0.1em] rounded mb-6">
              {post.thumbnail}
            </div>
            <h1 className="text-[40px] md:text-[56px] font-semibold text-[#1d1d1f] mb-6 leading-[1.05] tracking-[-0.034em] [text-wrap:balance]">
              {post.title}
            </h1>

            <div className="flex flex-wrap items-center justify-center gap-6 text-muted-foreground mb-6">
              <div className="flex items-center gap-2">
                <User className="h-4 w-4" />
                <span>{post.author}</span>
              </div>
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                <span>{BlogService.formatDate(post.date)}</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                <span>{post.readingTime}</span>
              </div>
            </div>

            <div className="flex flex-wrap justify-center gap-2 mb-6">
              {post.tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 px-3 py-1 bg-primary/10 text-primary text-sm rounded-full"
                >
                  <Tag className="h-3 w-3" />
                  {tag}
                </span>
              ))}
            </div>

            <p className="text-lg text-muted-foreground italic">
              {post.excerpt}
            </p>
          </header>

          {/* Content */}
          <div className="prose prose-lg max-w-none mb-12">
            <div className="text-foreground leading-relaxed space-y-2">
              {processContent(post.content)}
            </div>
          </div>

          {/* CTA */}
          <div className="bg-[#fbfbfd] border border-black/[0.06] rounded-2xl p-10 text-center">
            <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[#028a3e] mb-4">
              Done reading?
            </p>
            <h3 className="text-[28px] md:text-[36px] font-semibold tracking-[-0.025em] text-[#1d1d1f] mb-3 leading-[1.15]">
              Put it to work on your traffic.
            </h3>
            <p className="text-[16px] text-[#424245] mb-7 leading-[1.5] max-w-[520px] mx-auto">
              Two lines of code, one base URL. The savings dashboard shows the real delta against always-Opus, per request.
            </p>
            <Button
              onClick={() => navigate("/auth?mode=signup")}
              size="lg"
              className="rounded-full bg-[#1d1d1f] hover:bg-[#000] text-white shadow-[0_8px_24px_-8px_rgba(0,0,0,0.35)]"
            >
              Bring your own keys
            </Button>
          </div>
        </article>
      </div>
    </MarketingLayout>
  );
}
