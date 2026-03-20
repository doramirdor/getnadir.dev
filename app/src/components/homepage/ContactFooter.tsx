import { Button } from "@/components/ui/button";
import { Github } from "lucide-react";
import { useNavigate } from "react-router-dom";

export const ContactFooter = () => {
  const navigate = useNavigate();

  return (
    <>
      {/* CTA Section */}
      <section id="ready-to-simplify" className="container mx-auto px-6 py-16">
        <div className="max-w-2xl mx-auto text-center space-y-8 animate-fade-up">
          <div className="space-y-4">
            <h2 className="text-4xl font-semibold text-foreground">
              Ready to simplify your LLM stack?
            </h2>
            <p className="text-xl text-muted-foreground">
              Start your free trial today and optimize your AI costs immediately
            </p>
          </div>

          <div className="space-y-3 max-w-md mx-auto">
            <Button
              onClick={() => navigate("/dashboard")}
              size="lg"
              className="bg-primary hover:bg-primary/90 text-primary-foreground font-medium px-8 py-4 rounded-xl text-lg h-14 w-full sm:w-auto"
            >
              Get Started Free
            </Button>
            <p className="text-sm text-muted-foreground text-center">
              Free trial &middot; No credit card required &middot; 30-day trial
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-muted/50 py-8 mt-16">
        <div className="container mx-auto px-6">
          <div className="flex flex-col md:flex-row justify-between items-center space-y-4 md:space-y-0">
            <div className="flex items-center space-x-6">
              <span className="font-semibold text-lg text-foreground cursor-pointer" onClick={() => navigate("/")}>Nadir</span>
              <nav className="flex space-x-6 text-sm">
                <span onClick={() => navigate("/docs")} className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer">Docs</span>
                <span onClick={() => navigate("/blog")} className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer">Blog</span>
                <span onClick={() => navigate("/privacy")} className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer">Privacy</span>
                <span onClick={() => navigate("/terms")} className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer">Terms</span>
              </nav>
            </div>

            <div className="flex items-center space-x-4">
              <a href="#" className="text-muted-foreground hover:text-foreground transition-colors">
                <Github className="h-5 w-5" />
              </a>
            </div>
          </div>

          <div className="border-t border-border/50 mt-8 pt-6 text-center">
            <p className="text-sm text-muted-foreground">
              &copy; {new Date().getFullYear()} Nadir. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </>
  );
};
