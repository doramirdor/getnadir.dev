import { ArrowRight } from "lucide-react";

export const ArchitectureDiagram = () => {
  const steps = [
    { label: "User Request", icon: "👤" },
    { label: "Request Analysis", icon: "🔍" },
    { label: "Smart Gateway", icon: "⚡" },
    { label: "Model Selection", icon: "🎯" },
    { label: "Execution", icon: "🚀" },
    { label: "Analytics", icon: "📈" },
  ];

  return (
    <section className="bg-muted/30 py-16 pb-8">
      <div className="container mx-auto px-6">
        <div className="text-center space-y-4 mb-12 animate-fade-up">
          <h2 className="text-4xl font-semibold text-foreground">How Nadir Works</h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Smart AI gateway that automatically finds the best model for your needs - saving you money and improving performance
          </p>
        </div>

        <div className="max-w-6xl mx-auto">
          <div className="flex flex-wrap justify-center items-center gap-4 lg:gap-8 animate-fade-up-delay-1">
            {steps.map((step, index) => (
              <div key={index} className="flex items-center">
                <div className="text-center space-y-2">
                  <div className="w-16 h-16 bg-white rounded-full shadow-sm flex items-center justify-center border-2 border-primary/20">
                    <span className="text-2xl">{step.icon}</span>
                  </div>
                  <div className="text-sm font-medium text-foreground max-w-20">
                    {step.label}
                  </div>
                </div>

                {index < steps.length - 1 && (
                  <div className="hidden lg:flex items-center mx-4">
                    <ArrowRight className="h-6 w-6 text-primary" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};
