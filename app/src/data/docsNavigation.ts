import {
  Zap,
  Download,
  Settings,
  Brain,
  Sparkles,
  RotateCcw,
  Code,
  Network,
  Layers,
  BarChart3,
  Activity,
  Terminal,
  Crown,
  Package,
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
      { slug: "installation", label: "Installation", icon: Download },
      { slug: "configuration", label: "Configuration", icon: Settings },
    ],
  },
  {
    title: "Routing",
    sections: [
      { slug: "smart-routing", label: "Smart Routing", icon: Brain },
      { slug: "context-optimize", label: "Context Optimize", icon: Sparkles },
      { slug: "fallbacks", label: "Fallbacks & Budget", icon: RotateCcw },
    ],
  },
  {
    title: "Integrations",
    sections: [
      { slug: "claude-code", label: "Claude Code", icon: Code },
      { slug: "openclaw", label: "OpenClaw", icon: Network },
      { slug: "other-tools", label: "Other Tools", icon: Layers },
    ],
  },
  {
    title: "Observability",
    sections: [
      { slug: "dashboard", label: "Dashboard & Reports", icon: BarChart3 },
      { slug: "prometheus", label: "Prometheus Metrics", icon: Activity },
      { slug: "cli-commands", label: "CLI Reference", icon: Terminal },
    ],
  },
  {
    title: "SDKs",
    sections: [
      { slug: "sdk-python", label: "Python SDK", icon: Package },
      { slug: "sdk-node", label: "Node.js SDK", icon: Package },
    ],
  },
  {
    title: "Coming Soon (Pro)",
    sections: [
      { slug: "pro-features", label: "Pro Features", icon: Crown },
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
