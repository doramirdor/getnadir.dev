import { Zap, Shield, BarChart3, Settings } from "lucide-react";

export const AdvancedRoutingSection = () => {
  return (
    <section className="py-20 bg-gradient-to-b from-background to-muted/30">
      <div className="container mx-auto px-6">
        <div className="text-center space-y-4 mb-16 animate-fade-up">
          <h2 className="text-4xl font-bold text-foreground">
            Advanced Routing Strategies
          </h2>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            Go beyond complexity analysis with intelligent fallback chains and load balancing
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-12 max-w-7xl mx-auto">
          {/* Load Balancing */}
          <div className="space-y-8 animate-fade-up-delay-1">
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <BarChart3 className="h-6 w-6 text-blue-600" />
                </div>
                <h3 className="text-2xl font-semibold text-foreground">Load Balancing</h3>
              </div>
              <p className="text-lg text-muted-foreground">
                Intelligently distribute your AI traffic to optimize for cost, performance, or specific use cases.
              </p>
            </div>

            <div className="space-y-6">
              <div className="space-y-3">
                <h4 className="font-semibold text-foreground">How It Works</h4>
                <ul className="space-y-2 text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 bg-primary rounded-full mt-2 flex-shrink-0"></div>
                    <span>Create a Load Balancing Policy in your dashboard</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 bg-primary rounded-full mt-2 flex-shrink-0"></div>
                    <span>Configure your model distribution with assigned weights</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 bg-primary rounded-full mt-2 flex-shrink-0"></div>
                    <span>Each incoming request gets routed based on your distribution</span>
                  </li>
                </ul>
              </div>

              <div className="space-y-3">
                <h4 className="font-semibold text-foreground">How Does This Help?</h4>
                <div className="grid grid-cols-1 gap-3">
                  <div className="flex items-center gap-2">
                    <Zap className="h-4 w-4 text-green-600" />
                    <span className="text-sm">A/B Testing of model configurations</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Settings className="h-4 w-4 text-blue-600" />
                    <span className="text-sm">Smarter resource usage</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-purple-600" />
                    <span className="text-sm">Improved overall performance</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Fallback Policies */}
          <div className="space-y-8 animate-fade-up-delay-2">
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 rounded-lg">
                  <Shield className="h-6 w-6 text-green-600" />
                </div>
                <h3 className="text-2xl font-semibold text-foreground">Automatic Fallback</h3>
              </div>
              <p className="text-lg text-muted-foreground">
                Never be offline. Always have an answer. Ensure your AI services remain operational even when primary models fail.
              </p>
            </div>

            <div className="space-y-6">
              <div className="space-y-3">
                <h4 className="font-semibold text-foreground">How It Works</h4>
                <ul className="space-y-2 text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 bg-primary rounded-full mt-2 flex-shrink-0"></div>
                    <span>Your primary model gets the request</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 bg-primary rounded-full mt-2 flex-shrink-0"></div>
                    <span>If it fails (timeout, error, etc.), the router immediately tries the next model</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 bg-primary rounded-full mt-2 flex-shrink-0"></div>
                    <span>This continues until one model delivers the results you need</span>
                  </li>
                </ul>
              </div>

              <div className="space-y-3">
                <h4 className="font-semibold text-foreground">How Does This Help?</h4>
                <div className="grid grid-cols-1 gap-3">
                  <div className="flex items-center gap-2">
                    <Shield className="h-4 w-4 text-green-600" />
                    <span className="text-sm">Never Offline - Your AI services remain operational even when primary models fail</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Zap className="h-4 w-4 text-blue-600" />
                    <span className="text-sm">Higher Success - Dramatically increase your success rates with automatic failover</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-purple-600" />
                    <span className="text-sm">Cost Efficient - You only pay for what works, optimizing your AI spending</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
