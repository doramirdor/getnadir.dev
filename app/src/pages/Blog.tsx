import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { BlogService } from "@/services/blogService";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { SEO } from "@/components/SEO";

export default function Blog() {
  const navigate = useNavigate();
  const posts = BlogService.getAllPosts();

  return (
    <MarketingLayout>
      <SEO
        title="Blog - Nadir | LLM Cost Optimization Guides"
        description="Practical guides to cutting LLM API costs with intelligent routing and context optimization."
        path="/blog"
      />
      <div className="container mx-auto px-6 py-8">
        <div className="text-center space-y-4 mb-12">
          <h1 className="text-4xl font-semibold text-foreground">Blog</h1>
          <p className="text-xl text-muted-foreground">
            Insights on LLM routing, optimization, and AI infrastructure
          </p>
        </div>

        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {posts.map((post) => (
              <Card key={post.id} className="hover-lift border-0 shadow-sm h-full">
                <CardContent className="p-6 space-y-4 h-full flex flex-col">
                  <div className="inline-block px-2.5 py-1 bg-[#0a0a0a] text-white text-xs font-mono rounded">
                    {post.thumbnail}
                  </div>
                  <div className="space-y-2 flex-1">
                    <h3 className="font-semibold text-foreground text-lg leading-tight">
                      {post.title}
                    </h3>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <span>{BlogService.formatDate(post.date)}</span>
                      <span>&middot;</span>
                      <span>{post.readingTime}</span>
                    </div>
                    <p className="text-muted-foreground leading-relaxed">
                      {post.excerpt}
                    </p>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {post.tags.slice(0, 3).map((tag) => (
                        <span
                          key={tag}
                          className="px-2 py-1 bg-primary/10 text-primary text-xs rounded-full"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => navigate(`/blog/${post.id}`)}
                  >
                    Read more
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </MarketingLayout>
  );
}
