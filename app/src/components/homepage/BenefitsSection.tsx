import { Card, CardContent } from "@/components/ui/card";

export const BenefitsSection = () => {
  return (
    <section className="container mx-auto px-6 py-16">
      <div className="grid lg:grid-cols-2 gap-12 items-center">
        {/* Left Content */}
        <div className="space-y-6 animate-fade-up">
          <div className="space-y-4">
            <h2 className="text-4xl font-semibold text-foreground">
              See exactly what's happening with your AI
            </h2>
            <p className="text-lg text-muted-foreground">
              Get complete visibility into model performance, costs, and decision-making with detailed response metadata.
            </p>
          </div>

          <div className="space-y-4">
            <div className="flex items-start space-x-3">
              <div className="w-2 h-2 bg-primary rounded-full mt-2 flex-shrink-0"></div>
              <div>
                <h4 className="font-medium text-foreground">Cost tracking per request</h4>
                <p className="text-muted-foreground text-sm">Real-time cost analysis with provider comparison</p>
              </div>
            </div>
            <div className="flex items-start space-x-3">
              <div className="w-2 h-2 bg-primary rounded-full mt-2 flex-shrink-0"></div>
              <div>
                <h4 className="font-medium text-foreground">Model selection reasoning</h4>
                <p className="text-muted-foreground text-sm">Understand why each model was chosen</p>
              </div>
            </div>
            <div className="flex items-start space-x-3">
              <div className="w-2 h-2 bg-primary rounded-full mt-2 flex-shrink-0"></div>
              <div>
                <h4 className="font-medium text-foreground">Performance metrics</h4>
                <p className="text-muted-foreground text-sm">Latency, tokens, and quality scores</p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Code Panel */}
        <Card className="hidden lg:block animate-fade-up-delay-1 bg-gray-900 border-0 shadow-lg">
          <CardContent className="p-6">
            <pre className="text-sm text-green-400 font-mono leading-relaxed overflow-x-auto">
{`{
  "user_id": "43a1f84c-6a52-45e0-a8f2-73f3f89760db",
  "response": ....,
  "model_used": "gemini-2.5",
  "provider": "google",
  "latency_ms": 3731,
  "cost_usd": 0.0012,
  "tokens":{ "input": 13, "output": 150},
  "selection_reasoning": {
    "selection_method": "complexity_analysis",
    "reasoning": "Gemini 2.5 scores 72 on this simple factorial task,
                  making it a strong fit compared to your benchmark.",
    "complexity_score": 1,
    "complexity_reasoning": "Task complexity rated as 1 out of 5",
    "confidence": 0.95,
    "benchmark_comparison": {
      "benchmark_model": "claude-3-7-sonnet-20250219",
      "benchmark_provider": "Amazon Bedrock"
    }
  }
}`}
            </pre>
          </CardContent>
        </Card>
      </div>
    </section>
  );
};
