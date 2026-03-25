import {
  Zap,
  Key,
  Server,
  Brain,
  Settings,
  RotateCcw,
  Layers,
  Sparkles,
  BarChart3,
  Gamepad2,
  Code,
  List,
  Network,
  MessageSquare,
  SlidersHorizontal,
  AlertTriangle,
  GraduationCap,
  FlaskConical,
} from "lucide-react";

export interface DocSection {
  slug: string;
  label: string;
  icon: typeof Zap;
}

export interface DocGroup {
  title: string;
  sections: DocSection[];
}

export const docsNavigation: DocGroup[] = [
  {
    title: "Getting Started",
    sections: [
      { slug: "quickstart", label: "Quick Start", icon: Zap },
      { slug: "authentication", label: "Authentication", icon: Key },
      { slug: "models", label: "Models & Providers", icon: Server },
    ],
  },
  {
    title: "Routing",
    sections: [
      { slug: "smart-routing", label: "Smart Routing", icon: Brain },
      { slug: "presets", label: "Presets", icon: Settings },
      { slug: "fallbacks", label: "Fallbacks & Load Balancing", icon: RotateCcw },
    ],
  },
  {
    title: "Features",
    sections: [
      { slug: "clustering", label: "Prompt Clustering", icon: Layers },
      { slug: "smart-export", label: "Smart Export", icon: Sparkles },
      { slug: "distillation", label: "Distillation", icon: GraduationCap },
      { slug: "analytics", label: "Analytics & Logs", icon: BarChart3 },
      { slug: "playground", label: "Playground", icon: Gamepad2 },
    ],
  },
  {
    title: "API Reference",
    sections: [
      { slug: "api-completions", label: "POST /v1/chat/completions", icon: Code },
      { slug: "api-models", label: "Models API", icon: List },
      { slug: "api-clustering", label: "Clustering API", icon: Network },
      { slug: "api-recommendation", label: "POST /v1/chat/recommendation", icon: MessageSquare },
      { slug: "api-distillation", label: "Distillation API", icon: FlaskConical },
      { slug: "parameters", label: "Parameters Reference", icon: SlidersHorizontal },
      { slug: "errors", label: "Errors & Status Codes", icon: AlertTriangle },
    ],
  },
];

/** Flat ordered list of all section slugs */
export const allSections: DocSection[] = docsNavigation.flatMap(
  (g) => g.sections
);

/** All valid slugs */
export const validSlugs = new Set(allSections.map((s) => s.slug));

/** Get previous and next sections for a given slug */
export function getPrevNext(slug: string) {
  const idx = allSections.findIndex((s) => s.slug === slug);
  return {
    prev: idx > 0 ? allSections[idx - 1] : null,
    next: idx < allSections.length - 1 ? allSections[idx + 1] : null,
  };
}
