/**
 * Nadir blueprint redesign — Blog list (/blog). Reuses BlogService data.
 */
import { Link } from "react-router-dom";
import { BlogService } from "@/services/blogService";
import { RedesignLayout, PageHero, Section, Panel } from "@/components/brand/redesign";
import { Sparkle, FloraSprig } from "@/components/brand/motifs";

export default function Blog() {
  const posts = BlogService.getAllPosts();
  return (
    <RedesignLayout
      title="Nadir · Field notes"
      description="Practical guides to cutting LLM API costs with intelligent routing and context optimization. Written by the engineers shipping it."
      path="/blog"
      track="brand_redesign_blog"
    >
      <PageHero
        eyebrow="Field notes · Engineering blog"
        title="How we cut LLM bills,"
        accent="in detail."
        sub={<>Routing trade-offs, classifier internals, real benchmark numbers. Written by the engineers shipping it, not a content team.</>}
        hand="proof, not promises"
        motif={<FloraSprig className="h-40 w-24 opacity-90" />}
      />

      <Section rule={false}>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {posts.map((post) => (
            <Link key={post.id} to={`/blog/${post.id}`} className="no-underline">
              <Panel className="flex h-full flex-col p-6 lift">
                <span className="self-start rounded-full bg-[var(--ink)] px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-[var(--shell)]">{post.thumbnail}</span>
                <h3 className="mt-4 font-editorial text-[21px] leading-[1.15] text-[var(--ink)]">{post.title}</h3>
                <div className="mt-2.5 flex items-center gap-2 font-mono text-[11px] text-[var(--ink)]/55">
                  <span>{BlogService.formatDate(post.date)}</span><span>·</span><span>{post.readingTime}</span>
                </div>
                <p className="mt-3 flex-1 text-[13.5px] leading-relaxed text-[var(--ink)]/65 [display:-webkit-box] [-webkit-line-clamp:4] [-webkit-box-orient:vertical] overflow-hidden">{post.excerpt}</p>
                <div className="mt-5 flex items-center justify-between border-t border-dashed border-[var(--ink)]/15 pt-4">
                  <span className="flex flex-wrap gap-1.5">
                    {post.tags.slice(0, 2).map((t) => (
                      <span key={t} className="font-mono text-[10px] text-[var(--ink)]/45">#{t.replace(/\s+/g, "")}</span>
                    ))}
                  </span>
                  <span className="inline-flex items-center gap-1 eyebrow text-[var(--strawberry)]">Read <Sparkle className="h-2.5 w-2.5" color="var(--strawberry)" /></span>
                </div>
              </Panel>
            </Link>
          ))}
        </div>
      </Section>
    </RedesignLayout>
  );
}
