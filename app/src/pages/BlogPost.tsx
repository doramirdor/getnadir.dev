import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Clock, Calendar, User, Tag } from "lucide-react";
import { useEffect } from "react";
import { BlogService } from "@/services/blogService";
import { StickyCtaBar } from "@/components/homepage/StickyCtaBar";

export default function BlogPost() {
  const { id } = useParams();
  const navigate = useNavigate();

  const post = BlogService.getPostById(id || "");

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [id]);

  if (!post) {
    return (
      <div className="min-h-screen bg-background">
        <StickyCtaBar />
        <div className="container mx-auto px-6 py-24 text-center">
          <h1 className="text-2xl font-semibold text-foreground mb-4">
            Post not found
          </h1>
          <Button onClick={() => navigate("/")} variant="outline">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Home
          </Button>
        </div>
      </div>
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

        if (trimmed.startsWith("### ")) {
          return (
            <h3
              key={index}
              className="text-xl font-semibold text-foreground mt-6 mb-3"
            >
              {trimmed.replace("### ", "")}
            </h3>
          );
        }
        if (trimmed.startsWith("## ")) {
          return (
            <h2
              key={index}
              className="text-2xl font-semibold text-foreground mt-8 mb-4"
            >
              {trimmed.replace("## ", "")}
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
                              {cell}
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

  const formatInline = (text: string) => {
    const parts = text.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
        return (
          <strong key={i} className="font-bold text-foreground">
            {part.slice(2, -2)}
          </strong>
        );
      }
      return part;
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <StickyCtaBar />
      <div className="container mx-auto px-6 py-8 pt-20">
        <Button
          variant="ghost"
          className="mb-8 hover:bg-muted"
          onClick={() => navigate("/")}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Home
        </Button>

        <article className="max-w-4xl mx-auto">
          {/* Header */}
          <header className="text-center mb-12 border-b border-border pb-8">
            <div className="text-6xl mb-6">{post.thumbnail}</div>
            <h1 className="text-4xl lg:text-5xl font-bold text-foreground mb-6 leading-tight">
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
          <div className="bg-card border rounded-lg p-8 text-center">
            <h3 className="text-2xl font-semibold text-foreground mb-2">
              Want to learn more?
            </h3>
            <p className="text-muted-foreground mb-6">
              Try Nadir's intelligent LLM routing platform and start optimizing
              your AI costs today.
            </p>
            <Button onClick={() => navigate("/dashboard")} size="lg">
              Get Started Free
            </Button>
          </div>
        </article>
      </div>
    </div>
  );
}
