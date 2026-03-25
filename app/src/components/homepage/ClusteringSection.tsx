import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Brain, Zap, TrendingDown, Award, Download } from "lucide-react";
import { ClusterIcon } from "@/components/homepage/ClusterIcon";

export const ClusteringSection = () => {
  return (
    <section className="bg-gradient-to-b from-muted/30 to-background py-0">
      <div className="container mx-auto px-6">
        {/* Header */}
        <div className="text-center mb-16 animate-fade-up">
          <h2 className="text-4xl font-bold text-foreground mb-4">
            Self-Learning Cluster Logic
          </h2>
          <p className="text-xl text-muted-foreground max-w-4xl mx-auto">
            Our system automatically analyzes every prompt, categorizes it into intelligent clusters,
            and continuously learns to generate self-hosted export models optimized for your unique workload.
          </p>
        </div>

        {/* Process Flow */}
        <div className="max-w-5xl mx-auto mb-20">
          <Card className="animate-fade-up-delay-1">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-primary" />
                How It Works
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid md:grid-cols-4 gap-6">
                <div className="space-y-2">
                  <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                    <span className="text-lg font-semibold text-primary">1</span>
                  </div>
                  <h4 className="font-semibold text-foreground">Prompt Reception</h4>
                  <p className="text-sm text-muted-foreground">
                    Your request arrives at our gateway
                  </p>
                </div>

                <div className="space-y-2">
                  <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                    <span className="text-lg font-semibold text-primary">2</span>
                  </div>
                  <h4 className="font-semibold text-foreground">AI Analysis</h4>
                  <p className="text-sm text-muted-foreground">AI model classifies your prompts based on clusters fit to your unique patterns</p>
                </div>

                <div className="space-y-2">
                  <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                    <span className="text-lg font-semibold text-primary">3</span>
                  </div>
                  <h4 className="font-semibold text-foreground">Train Export</h4>
                  <p className="text-sm text-muted-foreground">Automatically fine tune an expert model for the prompt patterns</p>
                </div>

                <div className="space-y-2">
                  <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                    <span className="text-lg font-semibold text-primary">4</span>
                  </div>
                  <h4 className="font-semibold text-foreground">Smart Routing</h4>
                  <p className="text-sm text-muted-foreground">
                    Routed to the perfect model for the task
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Competitive Advantage with Icon */}
        <div className="max-w-5xl mx-auto mb-16">
          <Card className="animate-fade-up-delay-2 border-0 bg-primary/5">
            <CardHeader className="text-center">
              <CardTitle className="flex items-center justify-center gap-2">
                <Award className="h-5 w-5 text-primary" />
                The Self-Hosted Advantage
              </CardTitle>
              <CardDescription className="text-base">
                Unlike competitors, our system learns from your usage patterns
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col md:flex-row gap-8 items-center">
                <div className="w-full md:w-[30%] flex justify-center">
                  <ClusterIcon />
                </div>

                <div className="w-full md:w-[70%] space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Brain className="h-5 w-5 text-primary" />
                      <h4 className="font-semibold text-foreground">Continuous Learning</h4>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      The system runs in the background, clustering your prompts and learning your unique patterns
                    </p>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Download className="h-5 w-5 text-primary" />
                      <h4 className="font-semibold text-foreground">Export Your Model</h4>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Once enough data is collected, generate a self-hosted model trained specifically for your workload
                    </p>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <TrendingDown className="h-5 w-5 text-primary" />
                      <h4 className="font-semibold text-foreground">Ultimate Cost Savings</h4>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Your custom model eliminates API costs entirely while maintaining optimal performance
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
};
