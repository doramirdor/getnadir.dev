import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { BlogService } from "@/services/blogService";

export const BlogTeaser = () => {
  const navigate = useNavigate();
  const posts = BlogService.getAllPosts();

  return (
    <section className="container mx-auto px-6 py-16">
      <div className="text-center space-y-4 mb-12 animate-fade-up">
        <h2 className="text-4xl font-semibold text-foreground">
          Latest Insights
        </h2>
        <p className="text-xl text-muted-foreground">
          Learn about AI optimization and best practices
        </p>
      </div>

      <div className="max-w-6xl mx-auto">
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {posts.slice(0, 3).map((post) => (
            <Card key={post.id} className="hover-lift border-0 shadow-sm h-full">
              <CardContent className="p-6 space-y-4 h-full flex flex-col">
                <div className="text-4xl">{post.thumbnail}</div>
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

        <div className="text-center mt-10">
          <Button
            variant="outline"
            size="lg"
            onClick={() => navigate("/blog")}
          >
            View all posts
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </div>
    </section>
  );
};
