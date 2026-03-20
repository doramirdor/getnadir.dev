import { ArrowRight } from "lucide-react";

export const OnboardingSteps = () => {
  const steps = [
    { number: 1, title: "Signup", description: "Create your account in 30 seconds" },
    { number: 2, title: "Add API Keys", description: "Connect your favorite AI providers" },
    { number: 3, title: "Route & Save", description: "Start optimizing costs immediately" }
  ];

  return (
    <section className="container mx-auto px-6 py-16">
      <div className="max-w-4xl mx-auto">
        <div className="grid md:grid-cols-3 gap-8 items-center animate-fade-up">
          {steps.map((step, index) => (
            <div key={step.number} className="flex items-center">
              <div className="flex-1 text-center space-y-3">
                <div className="w-12 h-12 mx-auto bg-primary/10 border-2 border-primary/30 rounded-full flex items-center justify-center">
                  <span className="text-lg font-semibold text-primary">
                    {step.number}
                  </span>
                </div>
                <h3 className="font-semibold text-foreground">{step.title}</h3>
                <p className="text-sm text-muted-foreground">{step.description}</p>
              </div>

              {index < steps.length - 1 && (
                <div className="hidden md:flex items-center justify-center w-16">
                  <ArrowRight className="h-5 w-5 text-muted-foreground" />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
