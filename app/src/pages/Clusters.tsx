import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Network,
  Sparkles,
  Search,
  TrendingDown,
  Layers,
  Hash,
  Zap,
  Mail,
  ArrowRight,
  Gavel,
  Quote,
  ArrowLeft,
  Lightbulb,
  Clock,
  Coins,
  Check,
  MessageSquare,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { trackPageView, trackWaitlistSignup } from "@/utils/analytics";
import { formatUSD } from "@/utils/format";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────────────
// Demo data
// ─────────────────────────────────────────────────────────────────────────
//
// Clusters group by semantic similarity, not complexity tier. Inside a
// single cluster, individual prompts can still route to different models
// when the content gate (backend/app/complexity/content_gate.py) escalates
// outliers (e.g., a long-context or sensitive prompt). So each cluster
// carries a *routing distribution* on top of its centroid verdict.

interface SamplePrompt {
  text: string;
  distance: number; // cosine distance to centroid
  routedTo?: "Haiku 4.5" | "Sonnet 4.6" | "Opus 4.6";
  exampleResponse?: string;
  tokensIn?: number;
  tokensOut?: number;
  latencyMs?: number;
  costUsd?: number;
}

interface Recommendation {
  id: string;
  title: string;
  impactUsd: number;
  description: string;
  cta: string;
}

interface DemoCluster {
  id: string;
  label: string;
  tag: string;
  examples: number;
  pctTraffic: number;
  avgCostUsd: number;
  benchmarkRoute: string;
  centroidRoute: "Haiku 4.5" | "Sonnet 4.6" | "Opus 4.6";
  // What % of in-cluster prompts route to each tier (sums to 1).
  routingMix: { haiku: number; sonnet: number; opus: number };
  avgTokensIn: number;
  avgTokensOut: number;
  avgLatencyMs: number;
  monthlyTokens: number; // total tokens used this month
  monthlySavingsUsd: number;
  verdict: "approved-cheap" | "approved-mid" | "kept-premium";
  judgeReason: string;
  centroidSummary: string;
  recommendations: Recommendation[];
  // 2D map position
  x: number;
  y: number;
  samples: SamplePrompt[];
}

const DEMO_CLUSTERS: DemoCluster[] = [
  {
    id: "c_support_summary",
    label: "Summarize support ticket",
    tag: "support",
    examples: 38214,
    pctTraffic: 0.184,
    avgCostUsd: 0.0031,
    benchmarkRoute: "Opus 4.6",
    centroidRoute: "Haiku 4.5",
    routingMix: { haiku: 0.84, sonnet: 0.13, opus: 0.03 },
    avgTokensIn: 1820,
    avgTokensOut: 110,
    avgLatencyMs: 410,
    monthlyTokens: 73_700_000,
    monthlySavingsUsd: 412.18,
    verdict: "approved-cheap",
    judgeReason: "Judge n=200, win-rate 96.5% vs Opus on rubric. Approved 2026-04-18.",
    centroidSummary: "Short-form summarization of multi-turn customer support threads.",
    recommendations: [
      {
        id: "r1",
        title: "Cap output tokens at 200",
        impactUsd: 38,
        description: "Avg output is 110 tok; current max is 1024. Capping at 200 trims wasted spend without changing 99% of outputs.",
        cta: "Apply max_tokens=200",
      },
      {
        id: "r2",
        title: "Enable semantic cache for support summaries",
        impactUsd: 64,
        description: "Detected 18% near-duplicate ratio in this cluster. Caching responses past similarity threshold 0.92 saves ~$64/mo.",
        cta: "Turn on dedup",
      },
    ],
    x: 22,
    y: 28,
    samples: [
      {
        text: "Summarize this support ticket in 2 sentences for the engineer on call.",
        distance: 0.04,
        routedTo: "Haiku 4.5",
        exampleResponse: "Customer @maria-chen reports the SDK returns a 401 after upgrading to v2.3.1, even though the API key is unchanged. They've already cleared the cache and tried in two browsers; this is blocking their staging deploy.",
        tokensIn: 1742,
        tokensOut: 64,
        latencyMs: 384,
        costUsd: 0.0028,
      },
      { text: "TL;DR of the customer's last 3 messages so we can hand off the case.", distance: 0.07, routedTo: "Haiku 4.5" },
      { text: "Give me the gist of this conversation: who was angry, what they wanted, what we promised.", distance: 0.09, routedTo: "Haiku 4.5" },
      { text: "Compress this Zendesk thread to one paragraph for the daily ops digest.", distance: 0.06, routedTo: "Haiku 4.5" },
      { text: "Summarize the resolution steps the agent took, in bullet form.", distance: 0.11, routedTo: "Haiku 4.5" },
      { text: "Hand-off summary including SLA breach analysis and contractual obligations triggered (8k token thread).", distance: 0.18, routedTo: "Sonnet 4.6" },
      { text: "Two-sentence recap of this chat for the customer's CRM record.", distance: 0.05, routedTo: "Haiku 4.5" },
      { text: "Summarize this 14k-token Intercom escalation including legal-flagged content.", distance: 0.22, routedTo: "Opus 4.6" },
    ],
  },
  {
    id: "c_intent_classify",
    label: "Classify user intent",
    tag: "routing",
    examples: 18402,
    pctTraffic: 0.089,
    avgCostUsd: 0.0009,
    benchmarkRoute: "Opus 4.6",
    centroidRoute: "Haiku 4.5",
    routingMix: { haiku: 0.97, sonnet: 0.03, opus: 0 },
    avgTokensIn: 240,
    avgTokensOut: 8,
    avgLatencyMs: 180,
    monthlyTokens: 4_560_000,
    monthlySavingsUsd: 188.05,
    verdict: "approved-cheap",
    judgeReason: "Single-label classification, Haiku F1 0.94 vs Opus 0.95. Within tolerance.",
    centroidSummary: "Single-label classification: route an inbound message to a queue.",
    recommendations: [
      {
        id: "r1",
        title: "Switch to constrained decoding (label-only)",
        impactUsd: 12,
        description: "Output averages 8 tokens. Forcing a single-token enum eliminates the 3% Sonnet escalation cases entirely.",
        cta: "Constrain output",
      },
    ],
    x: 18,
    y: 42,
    samples: [
      {
        text: "Is this message a refund request, a bug report, or feedback? Reply with one word.",
        distance: 0.03,
        routedTo: "Haiku 4.5",
        exampleResponse: "refund",
        tokensIn: 218,
        tokensOut: 1,
        latencyMs: 162,
        costUsd: 0.0006,
      },
      { text: "Classify: pricing question / feature request / support / spam.", distance: 0.04, routedTo: "Haiku 4.5" },
      { text: "Which department should handle this email? sales, support, billing, other.", distance: 0.05, routedTo: "Haiku 4.5" },
      { text: "Tag this support email with the closest matching topic from this list.", distance: 0.06, routedTo: "Haiku 4.5" },
      { text: "Pick the intent: cancel, upgrade, downgrade, ask question, complain.", distance: 0.04, routedTo: "Haiku 4.5" },
      { text: "Categorize this 6k-token compliance email into one of 14 regulatory buckets.", distance: 0.16, routedTo: "Sonnet 4.6" },
      { text: "Output only one of these labels: urgent, normal, low.", distance: 0.05, routedTo: "Haiku 4.5" },
    ],
  },
  {
    id: "c_translate_ja",
    label: "Translate EN → JA",
    tag: "i18n",
    examples: 6530,
    pctTraffic: 0.031,
    avgCostUsd: 0.0021,
    benchmarkRoute: "Sonnet 4.6",
    centroidRoute: "Haiku 4.5",
    routingMix: { haiku: 0.91, sonnet: 0.08, opus: 0.01 },
    avgTokensIn: 92,
    avgTokensOut: 76,
    avgLatencyMs: 320,
    monthlyTokens: 1_100_000,
    monthlySavingsUsd: 41.10,
    verdict: "approved-cheap",
    judgeReason: "Short-form translation; Haiku BLEU 32.4 vs Sonnet 32.8 on 500 pairs.",
    centroidSummary: "Short EN → JA translations of UI strings, marketing copy, and emails.",
    recommendations: [
      {
        id: "r1",
        title: "Add a glossary for product nouns",
        impactUsd: 0,
        description: "8% of translations still escalate to Sonnet because product names are translated literally. A 12-term glossary keeps Haiku correct.",
        cta: "Upload glossary",
      },
    ],
    x: 30,
    y: 18,
    samples: [
      {
        text: "Translate to Japanese: \"Welcome to Nadir, your account is ready.\"",
        distance: 0.03,
        routedTo: "Haiku 4.5",
        exampleResponse: "Nadirへようこそ。アカウントの準備が整いました。",
        tokensIn: 88,
        tokensOut: 24,
        latencyMs: 286,
        costUsd: 0.0019,
      },
      { text: "Render this UI label in Japanese, business-formal tone.", distance: 0.05, routedTo: "Haiku 4.5" },
      { text: "Translate to Japanese: \"Reset your password to continue.\"", distance: 0.04, routedTo: "Haiku 4.5" },
      { text: "Localize this signup CTA in Japanese, keep it under 12 characters.", distance: 0.09, routedTo: "Haiku 4.5" },
      { text: "Translate this 800-word product launch announcement to Japanese, business register.", distance: 0.17, routedTo: "Sonnet 4.6" },
      { text: "Translate the following sentence to Japanese: \"Your trial expires in 3 days.\"", distance: 0.04, routedTo: "Haiku 4.5" },
    ],
  },
  {
    id: "c_product_desc",
    label: "Generate product description",
    tag: "marketing",
    examples: 21987,
    pctTraffic: 0.106,
    avgCostUsd: 0.0058,
    benchmarkRoute: "Opus 4.6",
    centroidRoute: "Sonnet 4.6",
    routingMix: { haiku: 0.18, sonnet: 0.74, opus: 0.08 },
    avgTokensIn: 460,
    avgTokensOut: 220,
    avgLatencyMs: 690,
    monthlyTokens: 14_900_000,
    monthlySavingsUsd: 271.92,
    verdict: "approved-mid",
    judgeReason: "Brand voice judged equivalent on 200 sample evaluations.",
    centroidSummary: "Marketing copy generation for product pages, emails, and ads.",
    recommendations: [
      {
        id: "r1",
        title: "Re-judge tagline subset on Haiku",
        impactUsd: 88,
        description: "Sub-cluster of taglines (~3.2k requests) is judged-eligible for Haiku. Splitting it out saves $88/mo.",
        cta: "Promote sub-cluster",
      },
      {
        id: "r2",
        title: "Cap output to 250 tokens for ad copy",
        impactUsd: 24,
        description: "Ad-copy variant averages 95 tokens out but max is 1024. Cap saves stragglers.",
        cta: "Apply max_tokens",
      },
    ],
    x: 55,
    y: 35,
    samples: [
      {
        text: "Write a 60-word product description for our new noise-cancelling headphones.",
        distance: 0.05,
        routedTo: "Sonnet 4.6",
        exampleResponse: "Tune out the world. Our flagship over-ears use adaptive ANC to cancel noise across 200Hz–4kHz, giving you 38 hours of playback per charge. Memory-foam cushions stay cool through long sessions, and a single multipoint connection lets you swap from laptop to phone without missing a note. Engineered for focus, built to disappear.",
        tokensIn: 442,
        tokensOut: 198,
        latencyMs: 712,
        costUsd: 0.0058,
      },
      { text: "Generate a tagline + 2-sentence pitch for the homepage hero.", distance: 0.08, routedTo: "Haiku 4.5" },
      { text: "Punch up this product copy, keep the same key claims, make it 30% shorter.", distance: 0.10, routedTo: "Sonnet 4.6" },
      { text: "Draft a 3-bullet feature list for the new pricing page.", distance: 0.07, routedTo: "Sonnet 4.6" },
      { text: "Write social copy (LinkedIn voice) announcing our Series A close.", distance: 0.16, routedTo: "Sonnet 4.6" },
      { text: "Compose a 4-line email subject + preview for our spring sale.", distance: 0.12, routedTo: "Haiku 4.5" },
      { text: "Rewrite this 12k-word brand-guidelines doc into a 3-pillar messaging framework.", distance: 0.21, routedTo: "Opus 4.6" },
      { text: "Give me 5 product description variants, A/B-friendly differences.", distance: 0.11, routedTo: "Sonnet 4.6" },
    ],
  },
  {
    id: "c_sql_gen",
    label: "SQL generation",
    tag: "analytics",
    examples: 5218,
    pctTraffic: 0.025,
    avgCostUsd: 0.012,
    benchmarkRoute: "Opus 4.6",
    centroidRoute: "Sonnet 4.6",
    routingMix: { haiku: 0.04, sonnet: 0.78, opus: 0.18 },
    avgTokensIn: 1240,
    avgTokensOut: 380,
    avgLatencyMs: 920,
    monthlyTokens: 8_400_000,
    monthlySavingsUsd: 89.04,
    verdict: "approved-mid",
    judgeReason: "Sonnet matches Opus on schema-grounded SQL; degrades on multi-CTE.",
    centroidSummary: "Generate Postgres / BigQuery SQL grounded in a known schema.",
    recommendations: [
      {
        id: "r1",
        title: "Detect multi-CTE prompts and route to Opus",
        impactUsd: 0,
        description: "18% already escalate. A regex-based gate would catch the remaining 4% that fail silently on Sonnet.",
        cta: "Update content gate",
      },
      {
        id: "r2",
        title: "Pre-compact schema context",
        impactUsd: 47,
        description: "Avg 1240 input tokens; 60% is the schema dump. Compacting via column allowlist saves $47/mo.",
        cta: "Enable compaction",
      },
    ],
    x: 62,
    y: 58,
    samples: [
      {
        text: "Write a Postgres query that returns weekly active users for the last 12 weeks.",
        distance: 0.05,
        routedTo: "Sonnet 4.6",
        exampleResponse: `SELECT
  date_trunc('week', activity_at) AS week,
  COUNT(DISTINCT user_id) AS wau
FROM events
WHERE activity_at >= now() - INTERVAL '12 weeks'
GROUP BY 1
ORDER BY 1;`,
        tokensIn: 1180,
        tokensOut: 92,
        latencyMs: 884,
        costUsd: 0.0118,
      },
      { text: "Given the orders table, get top 10 SKUs by revenue last quarter.", distance: 0.06, routedTo: "Sonnet 4.6" },
      { text: "SQL for: 30-day retention by signup cohort, weekly buckets.", distance: 0.08, routedTo: "Sonnet 4.6" },
      { text: "Write a query that joins users + subscriptions to flag anyone past trial.", distance: 0.07, routedTo: "Sonnet 4.6" },
      { text: "Multi-CTE query: cohort-adjusted LTV with funnel attribution and dedupe.", distance: 0.19, routedTo: "Opus 4.6" },
      { text: "Give me SQL that buckets cost into $0–10, $10–100, $100+ tiers.", distance: 0.12, routedTo: "Sonnet 4.6" },
    ],
  },
  {
    id: "c_email_reply",
    label: "Draft customer reply",
    tag: "support",
    examples: 14820,
    pctTraffic: 0.071,
    avgCostUsd: 0.0048,
    benchmarkRoute: "Opus 4.6",
    centroidRoute: "Sonnet 4.6",
    routingMix: { haiku: 0.22, sonnet: 0.71, opus: 0.07 },
    avgTokensIn: 920,
    avgTokensOut: 280,
    avgLatencyMs: 720,
    monthlyTokens: 17_800_000,
    monthlySavingsUsd: 196.42,
    verdict: "approved-mid",
    judgeReason: "Tone + factual accuracy parity at 95% Sonnet vs Opus.",
    centroidSummary: "Drafts of empathetic customer replies grounded in a knowledge base.",
    recommendations: [
      {
        id: "r1",
        title: "Pin tone-of-voice prefix",
        impactUsd: 31,
        description: "22% currently route to Haiku and lose tone consistency. Pinning a 40-token system prefix lifts quality without escalation.",
        cta: "Apply system prompt",
      },
    ],
    x: 42,
    y: 50,
    samples: [
      {
        text: "Draft a reply to this customer, apologize for the outage, link the status page.",
        distance: 0.06,
        routedTo: "Sonnet 4.6",
        exampleResponse: "Hi Jordan — really sorry for the disruption this morning. We had a regional outage in our us-east region between 09:14 and 09:42 UTC; full timeline and the fix are posted at status.getnadir.com/incidents/2026-04-25. Your retries between those windows will have failed, and we've already credited your account for the affected period. If you're seeing residual issues on your end, reply here and I'll dig in directly.",
        tokensIn: 904,
        tokensOut: 132,
        latencyMs: 698,
        costUsd: 0.0046,
      },
      { text: "Reply professionally to this refund request, offer a 50% credit instead.", distance: 0.09, routedTo: "Sonnet 4.6" },
      { text: "Write a thank-you email to a customer who just upgraded.", distance: 0.10, routedTo: "Haiku 4.5" },
      { text: "Compose a response to this NPS detractor, ask one follow-up question.", distance: 0.08, routedTo: "Sonnet 4.6" },
      { text: "Reply to this billing dispute, pull the relevant invoice line items.", distance: 0.13, routedTo: "Sonnet 4.6" },
      { text: "Draft a response to a legally-flagged GDPR data-export request, multi-jurisdiction.", distance: 0.20, routedTo: "Opus 4.6" },
    ],
  },
  {
    id: "c_pdf_extract",
    label: "Extract structured data from PDF",
    tag: "ocr",
    examples: 12044,
    pctTraffic: 0.058,
    avgCostUsd: 0.018,
    benchmarkRoute: "Opus 4.6",
    centroidRoute: "Opus 4.6",
    routingMix: { haiku: 0, sonnet: 0.11, opus: 0.89 },
    avgTokensIn: 4200,
    avgTokensOut: 540,
    avgLatencyMs: 1840,
    monthlyTokens: 56_800_000,
    monthlySavingsUsd: 0,
    verdict: "kept-premium",
    judgeReason: "Layout-sensitive OCR; smaller models miss line items >12% of the time.",
    centroidSummary: "Structured extraction from invoices, receipts, and statements.",
    recommendations: [
      {
        id: "r1",
        title: "Pre-OCR with Tesseract, then route extraction to Sonnet",
        impactUsd: 220,
        description: "11% already work on Sonnet when text is pre-extracted. Adding a Tesseract pre-pass could lift that to 60% and save ~$220/mo.",
        cta: "Enable pre-OCR pipeline",
      },
    ],
    x: 78,
    y: 72,
    samples: [
      {
        text: "Extract every line item from this invoice PDF as a JSON array.",
        distance: 0.06,
        routedTo: "Opus 4.6",
        exampleResponse: `[
  { "sku": "ANC-OE-04", "qty": 2, "unit_price": 349.00, "total": 698.00 },
  { "sku": "ACC-CASE-01", "qty": 2, "unit_price": 39.00, "total": 78.00 },
  { "sku": "WAR-EXT-2Y", "qty": 1, "unit_price": 49.00, "total": 49.00 }
]`,
        tokensIn: 4180,
        tokensOut: 184,
        latencyMs: 1820,
        costUsd: 0.0182,
      },
      { text: "Pull the total, vendor, due date, and PO number from the attached statement.", distance: 0.07, routedTo: "Sonnet 4.6" },
      { text: "Return a JSON object with all reimbursable expenses from this receipt.", distance: 0.08, routedTo: "Opus 4.6" },
      { text: "Extract bank statement transactions: date, amount, counterparty, balance.", distance: 0.10, routedTo: "Opus 4.6" },
      { text: "Read this 38-page contract PDF and pull start date, term, renewal clause, and indemnity scope.", distance: 0.13, routedTo: "Opus 4.6" },
    ],
  },
  {
    id: "c_code_review",
    label: "Code review with repo context",
    tag: "engineering",
    examples: 8712,
    pctTraffic: 0.042,
    avgCostUsd: 0.041,
    benchmarkRoute: "Opus 4.6",
    centroidRoute: "Opus 4.6",
    routingMix: { haiku: 0, sonnet: 0.06, opus: 0.94 },
    avgTokensIn: 12_400,
    avgTokensOut: 820,
    avgLatencyMs: 3210,
    monthlyTokens: 115_000_000,
    monthlySavingsUsd: 0,
    verdict: "kept-premium",
    judgeReason: "Long-context reasoning over multi-file diffs; Opus required.",
    centroidSummary: "Multi-file PR reviews requiring repo conventions and cross-references.",
    recommendations: [
      {
        id: "r1",
        title: "Split single-file lint reviews into a sub-cluster",
        impactUsd: 95,
        description: "~6% of requests are single-file diffs <500 LOC, judged-eligible for Sonnet. Splitting saves $95/mo.",
        cta: "Promote sub-cluster",
      },
    ],
    x: 84,
    y: 50,
    samples: [
      {
        text: "Review this PR diff against the CONTRIBUTING.md guidelines and flag issues.",
        distance: 0.05,
        routedTo: "Opus 4.6",
        exampleResponse: `Three things to address before merging:

1. **services/billing.py:142** — new public function lacks a docstring; CONTRIBUTING.md requires one for any function exposed at the module level.
2. **tests/test_billing.py** — no test coverage for the negative-amount branch added in line 88. Existing test only exercises happy path.
3. **migrations/0073_add_billing_status.sql** — column added without a default and no backfill. On a 30M-row table this will lock the table for ~minutes during deploy.

Style: imports look fine, type hints consistent, naming matches the rest of the module.`,
        tokensIn: 12_240,
        tokensOut: 412,
        latencyMs: 3120,
        costUsd: 0.0408,
      },
      { text: "Find any race conditions or missed error paths in this controller change.", distance: 0.07, routedTo: "Opus 4.6" },
      { text: "Audit this 6-file migration for backward-incompatible changes given the consumers.", distance: 0.10, routedTo: "Opus 4.6" },
      { text: "Lint this single-file diff for style only, ~120 LOC.", distance: 0.16, routedTo: "Sonnet 4.6" },
      { text: "Spot any N+1 queries in this PR's data access changes.", distance: 0.09, routedTo: "Opus 4.6" },
    ],
  },
  {
    id: "c_meeting_notes",
    label: "Summarize meeting transcript",
    tag: "productivity",
    examples: 9420,
    pctTraffic: 0.045,
    avgCostUsd: 0.0036,
    benchmarkRoute: "Sonnet 4.6",
    centroidRoute: "Haiku 4.5",
    routingMix: { haiku: 0.78, sonnet: 0.20, opus: 0.02 },
    avgTokensIn: 3600,
    avgTokensOut: 180,
    avgLatencyMs: 540,
    monthlyTokens: 35_700_000,
    monthlySavingsUsd: 95.76,
    verdict: "approved-cheap",
    judgeReason: "Short-form summarization of <5k token transcripts; Haiku within rubric.",
    centroidSummary: "Distill meeting transcripts into action items and decisions.",
    recommendations: [
      {
        id: "r1",
        title: "Route >8k token transcripts to Sonnet automatically",
        impactUsd: 0,
        description: "Currently 20% escalate manually. Wiring this into content_gate.py removes the back-and-forth.",
        cta: "Add length gate",
      },
      {
        id: "r2",
        title: "Cache action-item extractor on identical transcripts",
        impactUsd: 21,
        description: "9% near-duplicate ratio detected (same meeting summarized twice).",
        cta: "Enable dedup",
      },
    ],
    x: 12,
    y: 62,
    samples: [
      {
        text: "Summarize this 30-minute meeting transcript into 5 action items with owners.",
        distance: 0.04,
        routedTo: "Haiku 4.5",
        exampleResponse: `1. Maya — finalize the Q3 routing-policy doc by Fri 5/2.
2. Jordan — wire the new content_gate ruleset into staging by Mon 5/5.
3. Priya — schedule the Sonnet-vs-Haiku eval session with the data team this week.
4. Tom — pull a 7-day cost report broken out by cluster and share in #savings.
5. Maya & Jordan — write a one-page FAQ on the new fallback chain for support.`,
        tokensIn: 3450,
        tokensOut: 142,
        latencyMs: 512,
        costUsd: 0.0034,
      },
      { text: "Pull decisions made and open questions from this product review meeting.", distance: 0.06, routedTo: "Haiku 4.5" },
      { text: "Give me a 1-paragraph summary of this customer call, what they cared about.", distance: 0.08, routedTo: "Haiku 4.5" },
      { text: "List action items from this transcript, group by team.", distance: 0.05, routedTo: "Haiku 4.5" },
      { text: "Summarize this 2-hour all-hands transcript (>15k tokens), extract every commitment with owner and deadline.", distance: 0.18, routedTo: "Sonnet 4.6" },
      { text: "Extract every commitment with a deadline from this call transcript.", distance: 0.07, routedTo: "Haiku 4.5" },
    ],
  },
];

const DEMO_TOTAL_REQUESTS = DEMO_CLUSTERS.reduce((s, c) => s + c.examples, 0);
const DEMO_TOTAL_SAVINGS = DEMO_CLUSTERS.reduce((s, c) => s + c.monthlySavingsUsd, 0);
const DEMO_DEDUP_PCT = 0.21;

const VERDICT_COLORS: Record<DemoCluster["verdict"], { fill: string; stroke: string; chip: string; label: string }> = {
  "approved-cheap": {
    fill: "hsl(150, 60%, 55%)",
    stroke: "hsl(150, 65%, 38%)",
    chip: "chip chip-ok",
    label: "Approved → Haiku",
  },
  "approved-mid": {
    fill: "hsl(212, 80%, 60%)",
    stroke: "hsl(212, 85%, 42%)",
    chip: "chip chip-direct",
    label: "Approved → Sonnet",
  },
  "kept-premium": {
    fill: "hsl(38, 92%, 60%)",
    stroke: "hsl(28, 90%, 45%)",
    chip: "chip chip-warn",
    label: "Kept on Opus",
  },
};

const TIER_COLOR = {
  haiku: "hsl(150, 60%, 55%)",
  sonnet: "hsl(212, 80%, 60%)",
  opus: "hsl(38, 92%, 60%)",
};

function bubbleRadius(pct: number): number {
  const minR = 14;
  const maxR = 38;
  const t = Math.sqrt(pct / 0.2);
  return Math.max(minR, Math.min(maxR, minR + (maxR - minR) * t));
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

const DETAIL_CENTER_X = 50;
const DETAIL_CENTER_Y = 28;
const DETAIL_INNER_R = 6;
const DETAIL_MAX_R = 22;
const MAX_SAMPLE_DISTANCE = 0.25;

function promptPosition(idx: number, total: number, distance: number): { x: number; y: number } {
  const angle = (2 * Math.PI * idx) / total - Math.PI / 2;
  const norm = Math.min(distance / MAX_SAMPLE_DISTANCE, 1);
  const r = DETAIL_INNER_R + (DETAIL_MAX_R - DETAIL_INNER_R) * norm;
  return {
    x: DETAIL_CENTER_X + Math.cos(angle) * r,
    y: DETAIL_CENTER_Y + Math.sin(angle) * r,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────

const Clusters = () => {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [email, setEmail] = useState("");
  const [joined, setJoined] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [focusedSampleIdx, setFocusedSampleIdx] = useState<number | null>(null);
  const [exampleSampleIdx, setExampleSampleIdx] = useState<number | null>(null);
  const [appliedRecs, setAppliedRecs] = useState<Set<string>>(new Set());

  useEffect(() => { trackPageView("dashboard_clusters_coming_soon"); }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelectedId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const handleNotify = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) {
      toast({ title: "Add an email", description: "We'll let you know when clustering is live." });
      return;
    }
    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("waitlist").insert({
        email: trimmed,
        source: "dashboard_clusters",
        user_id: user?.id ?? null,
        metadata: { page: "/dashboard/clusters" },
      });
      // Unique-violation (already on the list) is a success from the user's POV.
      if (error && error.code !== "23505") throw error;
      trackWaitlistSignup("email", "dashboard_clusters");
      setJoined(true);
      toast({ title: "You're on the list", description: "We'll email you the moment clusters ship." });
    } catch (err: any) {
      toast({
        title: "Couldn't save your email",
        description: err?.message || "Please try again in a sec.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleApplyRec = (recId: string, title: string) => {
    setAppliedRecs((s) => {
      const n = new Set(s);
      n.add(recId);
      return n;
    });
    toast({
      title: "Recommendation queued",
      description: `"${title}" will apply once Clusters ships. We've recorded your intent.`,
    });
  };

  const selected = useMemo(
    () => (selectedId ? DEMO_CLUSTERS.find((c) => c.id === selectedId) ?? null : null),
    [selectedId]
  );

  const filtered = DEMO_CLUSTERS.filter((c) =>
    c.label.toLowerCase().includes(search.toLowerCase()) ||
    c.tag.toLowerCase().includes(search.toLowerCase())
  );

  const isDetail = selected !== null;

  const handleSelectCluster = (id: string) => {
    setSelectedId(id);
    setFocusedSampleIdx(null);
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="page-title m-0">Clusters</h1>
            <span
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold"
              style={{ background: "hsl(var(--brand-blue-soft))", color: "hsl(var(--brand-blue-strong))" }}
            >
              <Sparkles className="w-3 h-3" />
              Coming soon
            </span>
          </div>
          <p className="page-description">
            Group semantically similar prompts, judge each cluster's quality on a smaller model, and let Nadir auto-route entire workloads.
          </p>
        </div>
      </div>

      {/* Coming-soon banner with waitlist */}
      <Card
        className="clean-card border-2"
        style={{
          background: "linear-gradient(135deg, hsl(var(--brand-blue-soft)) 0%, hsl(var(--background)) 70%)",
          borderColor: "hsl(var(--brand-blue) / 0.3)",
        }}
      >
        <CardContent className="pt-6 pb-6">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
            <div className="flex-1 max-w-2xl">
              <p className="text-[20px] font-semibold tracking-tight text-foreground leading-tight mb-2">
                Click a cluster to see prompts, routing distribution, and recommendations.
              </p>
              <p className="text-sm text-muted-foreground">
                The data below is <strong>demo</strong>. We'll email you the moment we run this on your real prompts.
              </p>
            </div>
            {joined ? (
              <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[hsl(var(--ok-bg))] text-[hsl(var(--ok-strong))] text-sm font-medium">
                <Sparkles className="w-4 h-4" />
                You're on the list
              </div>
            ) : (
              <form onSubmit={handleNotify} className="flex gap-2 lg:max-w-sm w-full">
                <div className="relative flex-1">
                  <Mail className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    type="email"
                    placeholder="you@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-8"
                    disabled={submitting}
                  />
                </div>
                <Button type="submit" disabled={submitting} className="whitespace-nowrap">
                  {submitting ? "Saving..." : <>Notify me <ArrowRight className="w-3.5 h-3.5 ml-1.5" /></>}
                </Button>
              </form>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Demo summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SummaryCard icon={Layers} title="Clusters discovered" value={String(DEMO_CLUSTERS.length)} sub="last 30 days (demo)" />
        <SummaryCard icon={Hash} title="Requests grouped" value={DEMO_TOTAL_REQUESTS.toLocaleString()} sub="88% of all traffic clustered" />
        <SummaryCard icon={TrendingDown} title="Cluster-driven savings" value={`$${formatUSD(DEMO_TOTAL_SAVINGS)}`} sub="monthly, vs always-Opus" tone="ok" />
        <SummaryCard icon={Zap} title="Dedup rate" value={`${(DEMO_DEDUP_PCT * 100).toFixed(0)}%`} sub="near-duplicates served from cache" tone="brand" />
      </div>

      {/* Interactive cluster map + detail */}
      <Card className="clean-card overflow-hidden">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {isDetail ? (
                <button
                  onClick={() => setSelectedId(null)}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Back to all clusters
                </button>
              ) : (
                <>
                  <Network className="w-5 h-5 text-muted-foreground" strokeWidth={1.75} />
                  <CardTitle className="text-foreground">Cluster map</CardTitle>
                  <span className="chip chip-neutral text-[10px]">demo</span>
                </>
              )}
            </div>
            {!isDetail && (
              <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                <LegendDot color={VERDICT_COLORS["approved-cheap"].fill} label="Haiku" />
                <LegendDot color={VERDICT_COLORS["approved-mid"].fill} label="Sonnet" />
                <LegendDot color={VERDICT_COLORS["kept-premium"].fill} label="Opus" />
              </div>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {isDetail
              ? "Each dot is a prompt; distance from center is its cosine distance to the cluster centroid. Color = where it actually routed."
              : "Click a cluster to zoom in and see the prompts inside it."}
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* SVG */}
            <div className="relative w-full lg:col-span-2" style={{ aspectRatio: "16 / 9" }}>
              <svg
                viewBox="0 0 100 56.25"
                className="absolute inset-0 w-full h-full select-none"
                role="img"
                aria-label="2D map of prompt clusters"
              >
                <defs>
                  <pattern id="grid" width="10" height="10" patternUnits="userSpaceOnUse">
                    <path d="M 10 0 L 0 0 0 10" fill="none" stroke="hsl(var(--border))" strokeWidth="0.15" />
                  </pattern>
                </defs>
                <rect width="100" height="56.25" fill="url(#grid)" />

                {DEMO_CLUSTERS.map((c) => {
                  const isThis = selected?.id === c.id;
                  const overviewR = bubbleRadius(c.pctTraffic) * 0.18;
                  const detailR = isThis ? DETAIL_MAX_R + 1.5 : 0;
                  const r = isDetail ? detailR : overviewR;
                  const cx = isDetail && isThis ? DETAIL_CENTER_X : c.x;
                  const cy = isDetail && isThis ? DETAIL_CENTER_Y : c.y * 0.5625;
                  const opacity = isDetail ? (isThis ? 1 : 0) : hoverId && hoverId !== c.id ? 0.4 : 1;
                  const colors = VERDICT_COLORS[c.verdict];
                  const labelOffset = isDetail && isThis ? -DETAIL_MAX_R - 2.5 : -overviewR - 0.8;

                  return (
                    <g
                      key={c.id}
                      style={{
                        transition: "all 600ms cubic-bezier(0.4, 0, 0.2, 1)",
                        opacity,
                        cursor: isDetail ? "default" : "pointer",
                        pointerEvents: isDetail && !isThis ? "none" : "auto",
                      }}
                      onClick={() => !isDetail && handleSelectCluster(c.id)}
                      onMouseEnter={() => !isDetail && setHoverId(c.id)}
                      onMouseLeave={() => !isDetail && setHoverId(null)}
                    >
                      <circle
                        cx={cx}
                        cy={cy}
                        r={r}
                        fill={colors.fill}
                        fillOpacity={isDetail && isThis ? 0.12 : 0.2}
                        stroke={colors.stroke}
                        strokeWidth={isDetail && isThis ? 0.4 : 0.18}
                        style={{ transition: "all 600ms cubic-bezier(0.4, 0, 0.2, 1)" }}
                      />
                      {!isDetail && <circle cx={cx} cy={cy} r={0.5} fill={colors.stroke} />}
                      {!isDetail && (
                        <>
                          <text x={cx} y={cy + labelOffset} textAnchor="middle" fontSize="1.6" fill="hsl(var(--foreground))" fontWeight={500}>
                            {c.label}
                          </text>
                          <text x={cx} y={cy + labelOffset - 1.8} textAnchor="middle" fontSize="1.2" fill="hsl(var(--muted-foreground))">
                            {(c.pctTraffic * 100).toFixed(1)}% of traffic
                          </text>
                        </>
                      )}
                    </g>
                  );
                })}

                {isDetail && selected && (
                  <g>
                    <circle cx={DETAIL_CENTER_X} cy={DETAIL_CENTER_Y} r={1.4} fill={VERDICT_COLORS[selected.verdict].stroke} />
                    <text x={DETAIL_CENTER_X} y={DETAIL_CENTER_Y + 3} textAnchor="middle" fontSize="1.3" fill="hsl(var(--muted-foreground))">
                      centroid
                    </text>
                    <text x={DETAIL_CENTER_X} y={DETAIL_CENTER_Y - DETAIL_MAX_R - 4} textAnchor="middle" fontSize="2" fontWeight={600} fill="hsl(var(--foreground))">
                      {selected.label}
                    </text>

                    {[0.05, 0.12, 0.2].map((d) => {
                      const norm = Math.min(d / MAX_SAMPLE_DISTANCE, 1);
                      const r = DETAIL_INNER_R + (DETAIL_MAX_R - DETAIL_INNER_R) * norm;
                      return (
                        <g key={d}>
                          <circle cx={DETAIL_CENTER_X} cy={DETAIL_CENTER_Y} r={r} fill="none" stroke="hsl(var(--brand-blue) / 0.18)" strokeWidth="0.1" strokeDasharray="0.4 0.4" />
                          <text x={DETAIL_CENTER_X + r + 0.6} y={DETAIL_CENTER_Y + 0.4} fontSize="1.05" fill="hsl(var(--muted-foreground))">
                            d={d.toFixed(2)}
                          </text>
                        </g>
                      );
                    })}

                    {selected.samples.map((s, i) => {
                      const pos = promptPosition(i, selected.samples.length, s.distance);
                      const isFocused = focusedSampleIdx === i;
                      // Color the dot by where this prompt actually routed (not the centroid verdict).
                      const tier =
                        s.routedTo === "Haiku 4.5" ? "haiku" :
                        s.routedTo === "Sonnet 4.6" ? "sonnet" :
                        s.routedTo === "Opus 4.6" ? "opus" : null;
                      const dotFill = tier ? TIER_COLOR[tier] : VERDICT_COLORS[selected.verdict].fill;
                      const dotStroke = tier
                        ? (tier === "haiku" ? "hsl(150, 65%, 38%)" : tier === "sonnet" ? "hsl(212, 85%, 42%)" : "hsl(28, 90%, 45%)")
                        : VERDICT_COLORS[selected.verdict].stroke;
                      return (
                        <g
                          key={i}
                          style={{
                            transition: `all 600ms cubic-bezier(0.4, 0, 0.2, 1) ${250 + i * 60}ms`,
                            opacity: isDetail ? 1 : 0,
                            cursor: "pointer",
                          }}
                          onClick={() => setExampleSampleIdx(i)}
                          onMouseEnter={() => setFocusedSampleIdx(i)}
                          onMouseLeave={() => setFocusedSampleIdx(null)}
                        >
                          <line
                            x1={DETAIL_CENTER_X}
                            y1={DETAIL_CENTER_Y}
                            x2={pos.x}
                            y2={pos.y}
                            stroke={dotStroke}
                            strokeOpacity={isFocused ? 0.7 : 0.25}
                            strokeWidth={isFocused ? 0.3 : 0.15}
                            strokeDasharray="0.5 0.4"
                          />
                          <circle cx={pos.x} cy={pos.y} r={isFocused ? 1.6 : 1.2} fill={dotFill} stroke={dotStroke} strokeWidth="0.25" />
                          <text x={pos.x} y={pos.y + 0.45} textAnchor="middle" fontSize="1" fontWeight={700} fill={dotStroke}>
                            {i + 1}
                          </text>
                          {isFocused && (
                            <text x={pos.x} y={pos.y - 2.2} textAnchor="middle" fontSize="1.05" fill="hsl(var(--brand-blue-strong))" fontWeight={600}>
                              d={s.distance.toFixed(2)}
                            </text>
                          )}
                        </g>
                      );
                    })}
                  </g>
                )}
              </svg>
            </div>

            {/* Side panel */}
            <div className="lg:col-span-1">
              {isDetail && selected ? (
                <DetailPanel
                  cluster={selected}
                  focusedSampleIdx={focusedSampleIdx}
                  onFocusSample={(i) => setFocusedSampleIdx(i)}
                  onOpenExample={(i) => setExampleSampleIdx(i)}
                  appliedRecs={appliedRecs}
                  onApplyRec={handleApplyRec}
                />
              ) : (
                <OverviewPanel onSelect={handleSelectCluster} />
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Top clusters table */}
      <Card className="clean-card">
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-2">
              <Layers className="w-5 h-5 text-muted-foreground" strokeWidth={1.75} />
              <CardTitle className="text-foreground">Top clusters</CardTitle>
              <span className="chip chip-neutral text-[10px]">demo</span>
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Filter clusters..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 h-9" />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 pr-4 text-muted-foreground font-medium">Cluster</th>
                  <th className="text-right py-2 px-3 text-muted-foreground font-medium">Requests</th>
                  <th className="text-right py-2 px-3 text-muted-foreground font-medium">% traffic</th>
                  <th className="text-left py-2 px-3 text-muted-foreground font-medium">Routing mix</th>
                  <th className="text-right py-2 px-3 text-muted-foreground font-medium">Saved/mo</th>
                  <th className="text-right py-2 pl-3 text-muted-foreground font-medium">Verdict</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr
                    key={c.id}
                    className={cn(
                      "border-b border-border last:border-0 cursor-pointer hover:bg-muted/30 transition-colors",
                      c.id === selected?.id && "bg-[hsl(var(--brand-blue-soft))]/40"
                    )}
                    onClick={() => handleSelectCluster(c.id)}
                  >
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-foreground">{c.label}</span>
                        <span className="text-[10px] uppercase tracking-wide text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                          {c.tag}
                        </span>
                      </div>
                    </td>
                    <td className="text-right py-3 px-3 mono text-foreground">{c.examples.toLocaleString()}</td>
                    <td className="text-right py-3 px-3 mono text-muted-foreground">{(c.pctTraffic * 100).toFixed(1)}%</td>
                    <td className="py-3 px-3">
                      <RoutingBar mix={c.routingMix} compact />
                    </td>
                    <td className="text-right py-3 px-3 mono text-[hsl(var(--ok))]">
                      {c.monthlySavingsUsd > 0 ? `$${formatUSD(c.monthlySavingsUsd)}` : "—"}
                    </td>
                    <td className="text-right py-3 pl-3">
                      <span className={VERDICT_COLORS[c.verdict].chip}>{VERDICT_COLORS[c.verdict].label}</span>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={6} className="py-8 text-center text-sm text-muted-foreground">No clusters match "{search}"</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Prompt example dialog */}
      <PromptExampleDialog
        cluster={selected}
        sampleIdx={exampleSampleIdx}
        onClose={() => setExampleSampleIdx(null)}
      />

      {/* What clusters do */}
      <Card className="clean-card">
        <CardHeader><CardTitle className="text-foreground">What clustering will do</CardTitle></CardHeader>
        <CardContent>
          <div className="grid sm:grid-cols-3 gap-4">
            <div className="p-4 rounded-lg bg-muted/50">
              <Layers className="w-5 h-5 text-[hsl(var(--brand-blue-strong))] mb-2" strokeWidth={1.75} />
              <p className="font-medium text-foreground text-sm mb-1">Discover</p>
              <p className="text-xs text-muted-foreground">Embedding-based clustering surfaces the workloads you actually have, not the ones you assumed.</p>
            </div>
            <div className="p-4 rounded-lg bg-muted/50">
              <Gavel className="w-5 h-5 text-[hsl(var(--brand-blue-strong))] mb-2" strokeWidth={1.75} />
              <p className="font-medium text-foreground text-sm mb-1">Judge</p>
              <p className="text-xs text-muted-foreground">For every cluster, an LLM-as-judge evaluates whether a smaller model produces equivalent answers on a sampled batch.</p>
            </div>
            <div className="p-4 rounded-lg bg-muted/50">
              <Zap className="w-5 h-5 text-[hsl(var(--brand-blue-strong))] mb-2" strokeWidth={1.75} />
              <p className="font-medium text-foreground text-sm mb-1">Auto-route</p>
              <p className="text-xs text-muted-foreground">Approved clusters route automatically. Outlier prompts still escalate via the content gate when complexity warrants it.</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────

const SummaryCard = ({
  icon: Icon, title, value, sub, tone,
}: { icon: any; title: string; value: string; sub: string; tone?: "ok" | "brand" }) => (
  <Card className="clean-card">
    <CardHeader>
      <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
        <Icon className="w-4 h-4" strokeWidth={1.75} />
        {title}
      </CardTitle>
    </CardHeader>
    <CardContent>
      <p className={cn(
        "mono text-[24px] font-bold tracking-tight leading-none",
        tone === "ok" && "text-[hsl(var(--ok))]",
        tone === "brand" && "text-[hsl(var(--brand-blue-strong))]",
        !tone && "text-foreground"
      )}>{value}</p>
      <p className="text-xs text-muted-foreground mt-2">{sub}</p>
    </CardContent>
  </Card>
);

const OverviewPanel = ({ onSelect }: { onSelect: (id: string) => void }) => (
  <div className="h-full flex flex-col gap-3">
    <p className="text-xs font-semibold text-foreground uppercase tracking-wide">Pick a cluster</p>
    <div className="space-y-1.5 flex-1 overflow-auto max-h-[400px]">
      {DEMO_CLUSTERS.slice().sort((a, b) => b.examples - a.examples).map((c) => (
        <button
          key={c.id}
          onClick={() => onSelect(c.id)}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-accent transition-colors text-left"
        >
          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: VERDICT_COLORS[c.verdict].fill }} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground truncate">{c.label}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
              {c.examples.toLocaleString()} requests · {(c.pctTraffic * 100).toFixed(1)}%
            </p>
          </div>
          <ArrowRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        </button>
      ))}
    </div>
  </div>
);

const RoutingBar = ({ mix, compact = false }: { mix: { haiku: number; sonnet: number; opus: number }; compact?: boolean }) => {
  const segments = [
    { key: "haiku", color: TIER_COLOR.haiku, pct: mix.haiku, label: "Haiku" },
    { key: "sonnet", color: TIER_COLOR.sonnet, pct: mix.sonnet, label: "Sonnet" },
    { key: "opus", color: TIER_COLOR.opus, pct: mix.opus, label: "Opus" },
  ].filter((s) => s.pct > 0);

  return (
    <div className={compact ? "w-32" : "w-full"}>
      <div className="flex h-2 rounded-full overflow-hidden bg-muted">
        {segments.map((s) => (
          <div key={s.key} style={{ width: `${s.pct * 100}%`, background: s.color }} title={`${s.label} ${(s.pct * 100).toFixed(0)}%`} />
        ))}
      </div>
      {!compact && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-[10px] text-muted-foreground">
          {segments.map((s) => (
            <span key={s.key} className="inline-flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: s.color }} />
              <span className="text-foreground font-medium mono">{(s.pct * 100).toFixed(0)}%</span>
              <span>{s.label}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

const StatBlock = ({ icon: Icon, label, value, sub }: { icon: any; label: string; value: string; sub?: string }) => (
  <div className="p-2.5 rounded-lg bg-muted/50">
    <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mb-1">
      <Icon className="w-3 h-3" strokeWidth={1.75} />
      {label}
    </div>
    <p className="mono text-sm font-bold text-foreground leading-none">{value}</p>
    {sub && <p className="text-[10px] text-muted-foreground mt-1">{sub}</p>}
  </div>
);

const DetailPanel = ({
  cluster,
  focusedSampleIdx,
  onFocusSample,
  onOpenExample,
  appliedRecs,
  onApplyRec,
}: {
  cluster: DemoCluster;
  focusedSampleIdx: number | null;
  onFocusSample: (i: number) => void;
  onOpenExample: (i: number) => void;
  appliedRecs: Set<string>;
  onApplyRec: (id: string, title: string) => void;
}) => (
  <div className="space-y-5">
    {/* Header */}
    <div>
      <div className="flex items-center justify-between gap-2 mb-1">
        <p className="text-base font-semibold text-foreground">{cluster.label}</p>
        <span className={VERDICT_COLORS[cluster.verdict].chip}>{VERDICT_COLORS[cluster.verdict].label}</span>
      </div>
      <p className="text-xs text-muted-foreground">{cluster.centroidSummary}</p>
    </div>

    {/* Stats grid */}
    <div className="grid grid-cols-2 gap-2">
      <StatBlock icon={Hash} label="Requests" value={cluster.examples.toLocaleString()} sub={`${(cluster.pctTraffic * 100).toFixed(1)}% of traffic`} />
      <StatBlock icon={Coins} label="Avg cost" value={`$${cluster.avgCostUsd.toFixed(4)}`} sub="per request" />
      <StatBlock icon={Hash} label="Tokens / req" value={`${formatTokens(cluster.avgTokensIn)} / ${formatTokens(cluster.avgTokensOut)}`} sub="in / out" />
      <StatBlock icon={Clock} label="Avg latency" value={`${cluster.avgLatencyMs}ms`} sub={`${formatTokens(cluster.monthlyTokens)} tok/mo`} />
    </div>

    {/* Routing distribution */}
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <Network className="w-3.5 h-3.5 text-muted-foreground" strokeWidth={1.75} />
          <p className="text-xs font-semibold text-foreground uppercase tracking-wide">Routing distribution</p>
        </div>
        {cluster.monthlySavingsUsd > 0 && (
          <span className="text-[10px] text-[hsl(var(--ok))] font-medium">
            -${formatUSD(cluster.monthlySavingsUsd)}/mo vs {cluster.benchmarkRoute}
          </span>
        )}
      </div>
      <RoutingBar mix={cluster.routingMix} />
    </div>

    {/* Judge verdict */}
    <div className="p-3 rounded-lg bg-muted/50 border border-border">
      <div className="flex items-center gap-1.5 mb-1.5">
        <Gavel className="w-3.5 h-3.5 text-muted-foreground" strokeWidth={1.75} />
        <p className="text-xs font-semibold text-foreground uppercase tracking-wide">Judge verdict</p>
      </div>
      <p className="text-xs text-muted-foreground">{cluster.judgeReason}</p>
    </div>

    {/* Recommendations */}
    {cluster.recommendations.length > 0 && (
      <div>
        <div className="flex items-center gap-1.5 mb-2">
          <Lightbulb className="w-3.5 h-3.5 text-muted-foreground" strokeWidth={1.75} />
          <p className="text-xs font-semibold text-foreground uppercase tracking-wide">
            Recommendations ({cluster.recommendations.length})
          </p>
        </div>
        <ul className="space-y-2">
          {cluster.recommendations.map((r) => {
            const applied = appliedRecs.has(r.id);
            return (
              <li
                key={r.id}
                className="p-3 rounded-lg border border-border bg-background"
                style={{ borderLeftWidth: 3, borderLeftColor: "hsl(var(--brand-blue))" }}
              >
                <div className="flex items-start justify-between gap-2 mb-1">
                  <p className="text-sm font-medium text-foreground">{r.title}</p>
                  {r.impactUsd > 0 && (
                    <span className="text-[11px] mono text-[hsl(var(--ok))] font-semibold whitespace-nowrap">
                      ~${r.impactUsd}/mo
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mb-2">{r.description}</p>
                <Button
                  size="sm"
                  variant={applied ? "outline" : "default"}
                  className="h-7 text-xs"
                  onClick={() => onApplyRec(r.id, r.title)}
                  disabled={applied}
                >
                  {applied ? (<><Check className="w-3 h-3 mr-1" />Queued</>) : r.cta}
                </Button>
              </li>
            );
          })}
        </ul>
      </div>
    )}

    {/* Sample prompts */}
    <div>
      <div className="flex items-center gap-1.5 mb-2">
        <Quote className="w-3.5 h-3.5 text-muted-foreground" strokeWidth={1.75} />
        <p className="text-xs font-semibold text-foreground uppercase tracking-wide">
          Prompts in this cluster ({cluster.samples.length})
        </p>
      </div>
      <ul className="space-y-1.5 max-h-[280px] overflow-auto pr-1">
        {cluster.samples.map((s, i) => ({ s, i }))
          .sort((a, b) => a.s.distance - b.s.distance)
          .map(({ s, i }) => {
            const isFocused = i === focusedSampleIdx;
            const tier =
              s.routedTo === "Haiku 4.5" ? "haiku" :
              s.routedTo === "Sonnet 4.6" ? "sonnet" :
              s.routedTo === "Opus 4.6" ? "opus" : null;
            return (
              <li key={i}>
                <button
                  onMouseEnter={() => onFocusSample(i)}
                  onClick={() => onOpenExample(i)}
                  className={cn(
                    "w-full flex items-start gap-2 px-2.5 py-2 rounded-md text-left transition-all",
                    isFocused ? "bg-[hsl(var(--brand-blue-soft))]" : "hover:bg-accent"
                  )}
                  title="Click to see example response"
                >
                  <span
                    className={cn(
                      "shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold mt-0.5 transition-colors",
                      isFocused ? "bg-[hsl(var(--brand-blue))] text-white" : "bg-muted text-muted-foreground"
                    )}
                  >
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-foreground italic leading-snug">"{s.text}"</p>
                    <p className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1.5">
                      <span className="mono">d={s.distance.toFixed(2)}</span>
                      <span>·</span>
                      <span>
                        {s.distance < 0.07 ? "centroid prompt" : s.distance < 0.14 ? "typical" : "boundary prompt"}
                      </span>
                      {tier && (
                        <>
                          <span>·</span>
                          <span className="inline-flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full" style={{ background: TIER_COLOR[tier] }} />
                            <span className="font-medium text-foreground">{s.routedTo}</span>
                          </span>
                        </>
                      )}
                    </p>
                  </div>
                </button>
              </li>
            );
          })}
      </ul>
    </div>
  </div>
);

const PromptExampleDialog = ({
  cluster,
  sampleIdx,
  onClose,
}: {
  cluster: DemoCluster | null;
  sampleIdx: number | null;
  onClose: () => void;
}) => {
  const open = cluster !== null && sampleIdx !== null;
  const sample = open ? cluster!.samples[sampleIdx!] : null;
  const tier = sample?.routedTo === "Haiku 4.5"
    ? "haiku"
    : sample?.routedTo === "Sonnet 4.6"
    ? "sonnet"
    : sample?.routedTo === "Opus 4.6"
    ? "opus"
    : null;
  const tokensIn = sample?.tokensIn ?? cluster?.avgTokensIn ?? 0;
  const tokensOut = sample?.tokensOut ?? cluster?.avgTokensOut ?? 0;
  const latencyMs = sample?.latencyMs ?? cluster?.avgLatencyMs ?? 0;
  const costUsd = sample?.costUsd ?? cluster?.avgCostUsd ?? 0;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-muted-foreground" strokeWidth={1.75} />
            Example from {cluster?.label}
          </DialogTitle>
        </DialogHeader>
        {sample && cluster && (
          <div className="space-y-4">
            {/* Routing chip + distance */}
            <div className="flex items-center gap-2 flex-wrap">
              {tier && (
                <span
                  className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[11px] font-medium"
                  style={{
                    background: tier === "haiku"
                      ? "hsl(150, 60%, 95%)"
                      : tier === "sonnet"
                      ? "hsl(212, 80%, 95%)"
                      : "hsl(38, 92%, 95%)",
                    color: tier === "haiku"
                      ? "hsl(150, 65%, 28%)"
                      : tier === "sonnet"
                      ? "hsl(212, 85%, 32%)"
                      : "hsl(28, 90%, 35%)",
                  }}
                >
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: TIER_COLOR[tier] }} />
                  Routed to {sample.routedTo}
                </span>
              )}
              <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[11px] font-medium bg-muted text-muted-foreground mono">
                d={sample.distance.toFixed(2)}
              </span>
              <span className="text-[11px] text-muted-foreground">
                {sample.distance < 0.07
                  ? "centroid prompt"
                  : sample.distance < 0.14
                  ? "typical prompt"
                  : "boundary prompt"}
              </span>
            </div>

            {/* Prompt */}
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mb-1.5">Prompt</p>
              <div className="p-3 rounded-md bg-muted/40 border border-border text-sm text-foreground italic">
                "{sample.text}"
              </div>
            </div>

            {/* Response */}
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mb-1.5">Response</p>
              {sample.exampleResponse ? (
                <pre className="p-3 rounded-md bg-muted/40 border border-border text-sm text-foreground whitespace-pre-wrap font-sans leading-relaxed">
{sample.exampleResponse}
                </pre>
              ) : (
                <div className="p-3 rounded-md bg-muted/40 border border-border text-xs text-muted-foreground italic">
                  Real responses appear here once Clusters runs on your traffic. This is a demo prompt without a stored response.
                </div>
              )}
            </div>

            {/* Metadata */}
            <div className="grid grid-cols-4 gap-2 pt-2 border-t border-border">
              <Metric label="Tokens in" value={tokensIn.toLocaleString()} />
              <Metric label="Tokens out" value={tokensOut.toLocaleString()} />
              <Metric label="Latency" value={`${latencyMs}ms`} />
              <Metric label="Cost" value={`$${costUsd.toFixed(4)}`} />
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

const Metric = ({ label, value }: { label: string; value: string }) => (
  <div>
    <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">{label}</p>
    <p className="mono text-sm font-bold text-foreground leading-none mt-1">{value}</p>
  </div>
);

const LegendDot = ({ color, label }: { color: string; label: string }) => (
  <span className="inline-flex items-center gap-1.5">
    <span className="w-2 h-2 rounded-full" style={{ background: color }} />
    {label}
  </span>
);

export default Clusters;
