import { Card, CardContent } from "@/components/ui/card";

export const FeaturesGrid = () => {
  const features = [
    {
      title: "Smart Model Selection",
      description: "Automatically picks the best AI model for each request - saving you money while improving response quality.",
      icon: "🧠"
    },
    {
      title: "Cost Control Made Simple",
      description: "See exactly how much you're spending on AI with real-time tracking, budgets, and alerts - no surprises.",
      icon: "💰"
    },
    {
      title: "Performance Insights",
      description: "Understand which models work best for your use cases with easy-to-read dashboards and performance metrics.",
      icon: "📊"
    },
    {
      title: "Smart Clustering",
      description: "Automatically groups similar prompts into intelligent clusters to optimize routing and reduce costs.",
      icon: "🛡️"
    }
  ];

  return (
    <section className="container mx-auto px-6 py-16">
      <div className="text-center space-y-4 mb-12 animate-fade-up">
        <h2 className="text-4xl font-semibold text-foreground">
          Everything you need to manage LLMs
        </h2>
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
          Powerful features designed to simplify your AI infrastructure
        </p>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
        {features.map((feature, index) => (
          <Card
            key={index}
            className={`hover-lift border-0 shadow-sm bg-card p-6 animate-fade-up-delay-${(index % 3) + 1}`}
          >
            <CardContent className="p-0 text-center space-y-4">
              <div className="text-4xl">{feature.icon}</div>
              <h3 className="font-semibold text-foreground">{feature.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {feature.description}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
};
