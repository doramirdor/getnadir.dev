import React from 'react';
import {
  AbsoluteFill,
  useCurrentFrame,
  interpolate,
  spring,
  useVideoConfig,
} from 'remotion';

const BUDGET = 500;

const USERS = [
  { name: 'sarah', avatar: '👩‍💻' },
  { name: 'mike', avatar: '👨‍💻' },
  { name: 'priya', avatar: '👩‍🔬' },
  { name: 'jake', avatar: '👨‍🎨' },
  { name: 'anna', avatar: '👩‍💼' },
  { name: 'ci-bot', avatar: '⚙️' },
  { name: 'qa-bot', avatar: '🧪' },
  { name: 'devops', avatar: '🤖' },
  { name: 'tom', avatar: '🧑‍💻' },
  { name: 'lin', avatar: '👩‍🏫' },
];

const PROMPTS = [
  { text: 'Summarize the Q3 board deck...', tier: 'simple' as const },
  { text: 'Fix the race condition in...', tier: 'mid' as const },
  { text: 'What does this error mean...', tier: 'simple' as const },
  { text: 'Design a multi-tenant schema...', tier: 'complex' as const },
  { text: 'Write tests for payment flow...', tier: 'mid' as const },
  { text: 'Translate onboarding to FR...', tier: 'simple' as const },
  { text: 'Refactor auth middleware...', tier: 'complex' as const },
  { text: 'Explain this regex pattern...', tier: 'simple' as const },
  { text: 'Draft PR description for...', tier: 'simple' as const },
  { text: 'Review this diff and flag...', tier: 'mid' as const },
  { text: 'Generate edge-case tests...', tier: 'mid' as const },
  { text: 'Architect real-time sync...', tier: 'complex' as const },
  { text: 'Lint /src/utils folder...', tier: 'simple' as const },
  { text: 'Analyze prod error logs...', tier: 'simple' as const },
  { text: 'Write investor update email...', tier: 'mid' as const },
  { text: 'Build CI/CD pipeline for...', tier: 'complex' as const },
  { text: 'Convert CSV parser to stream...', tier: 'mid' as const },
  { text: 'Add rate limiting to API...', tier: 'mid' as const },
  { text: 'What is the difference betw...', tier: 'simple' as const },
  { text: 'Optimize database query for...', tier: 'mid' as const },
  { text: 'Create OpenAPI spec from...', tier: 'simple' as const },
  { text: 'Debug memory leak in worker...', tier: 'complex' as const },
  { text: 'Write changelog from commits...', tier: 'simple' as const },
  { text: 'Setup monitoring alerts for...', tier: 'mid' as const },
  { text: 'Migrate from REST to gRPC...', tier: 'complex' as const },
  { text: 'Format response as markdown...', tier: 'simple' as const },
  { text: 'Generate seed data for dev...', tier: 'simple' as const },
  { text: 'Review security headers on...', tier: 'mid' as const },
  { text: 'Write e2e test for checkout...', tier: 'mid' as const },
  { text: 'Implement retry logic with...', tier: 'mid' as const },
  { text: 'Parse webhook payload from...', tier: 'simple' as const },
  { text: 'Design event sourcing for...', tier: 'complex' as const },
  { text: 'Add dark mode to settings...', tier: 'simple' as const },
  { text: 'Compress images in /assets...', tier: 'simple' as const },
  { text: 'Write Dockerfile for staging...', tier: 'mid' as const },
  { text: 'Audit npm deps for vulns...', tier: 'simple' as const },
  { text: 'Refactor state management...', tier: 'complex' as const },
  { text: 'Generate TypeScript types...', tier: 'simple' as const },
  { text: 'Build search with Postgres...', tier: 'complex' as const },
  { text: 'Write integration test for...', tier: 'mid' as const },
];

const COST_MAP_OPUS = { simple: 8, mid: 14, complex: 22 };
const COST_MAP_NADIR = { simple: 0.5, mid: 2, complex: 8 };
const MODEL_MAP = { simple: 'Haiku', mid: 'Sonnet', complex: 'Opus' };

const seed = (i: number) => {
  const x = Math.sin(i * 9973.13 + 7) * 43758.5453;
  return x - Math.floor(x);
};

const REQ_INTERVAL = 6;
const VISIBLE_ROWS = 14;
const H = 1080;
const W = 1920;
const HALF = W / 2;
const DIVIDER = 4;

const COLORS = {
  bg: '#0a0a0f',
  bgLeft: '#0c0812',
  bgRight: '#080f12',
  red: '#ff3b5c',
  green: '#00e89d',
  cyan: '#00e5ff',
  white: '#f0f0f5',
  muted: '#6b7094',
  divider: '#1a1a2e',
  cardBg: '#12121e',
  cardBorder: '#1e1e34',
  tierSimple: '#00e89d',
  tierMid: '#ffaa20',
  tierComplex: '#ff5070',
};

interface ReqRow {
  user: typeof USERS[0];
  prompt: typeof PROMPTS[0];
  costOpus: number;
  costNadir: number;
  model: string;
}

const allRequests: ReqRow[] = [];
for (let i = 0; i < 120; i++) {
  const user = USERS[Math.floor(seed(i * 3) * USERS.length)];
  const prompt = PROMPTS[Math.floor(seed(i * 7 + 1) * PROMPTS.length)];
  allRequests.push({
    user,
    prompt,
    costOpus: COST_MAP_OPUS[prompt.tier],
    costNadir: COST_MAP_NADIR[prompt.tier],
    model: MODEL_MAP[prompt.tier],
  });
}

let opusBudgetHitIdx = 0;
{
  let sum = 0;
  for (let i = 0; i < allRequests.length; i++) {
    sum += allRequests[i].costOpus;
    if (sum > BUDGET) { opusBudgetHitIdx = i; break; }
  }
}

const reqFrame = (i: number) => i * REQ_INTERVAL + 20;
const FREEZE_FRAME = reqFrame(opusBudgetHitIdx) + 10;

const TierDot: React.FC<{ tier: string }> = ({ tier }) => {
  const color = tier === 'simple' ? COLORS.tierSimple : tier === 'mid' ? COLORS.tierMid : COLORS.tierComplex;
  return <div style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />;
};

const LogRow: React.FC<{
  req: ReqRow;
  index: number;
  side: 'left' | 'right';
  opacity: number;
}> = ({ req, index, side, opacity }) => {
  const isRight = side === 'right';
  const cost = isRight ? req.costNadir : req.costOpus;
  const model = isRight ? req.model : 'Opus';
  const accentColor = isRight ? COLORS.green : COLORS.red;
  const modelColor = isRight
    ? req.prompt.tier === 'complex' ? COLORS.tierComplex : COLORS.cyan
    : COLORS.muted;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '4px 10px', opacity,
      borderBottom: `1px solid ${COLORS.cardBorder}`,
      height: 32, flexShrink: 0,
    }}>
      <span style={{ fontSize: 14, lineHeight: 1, width: 20, textAlign: 'center' }}>{req.user.avatar}</span>
      <span style={{ fontSize: 11, color: COLORS.muted, width: 52, fontWeight: 600 }}>{req.user.name}</span>
      {isRight && <TierDot tier={req.prompt.tier} />}
      <span style={{
        fontSize: 11, color: '#555570', flex: 1,
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        fontFamily: '"SF Mono", monospace',
      }}>
        {req.prompt.text}
      </span>
      <span style={{ fontSize: 10, color: modelColor, fontWeight: 600, width: 44, textAlign: 'center' }}>
        {model}
      </span>
      <span style={{
        fontSize: 11, fontWeight: 700, color: accentColor,
        fontFamily: '"SF Mono", monospace', width: 40, textAlign: 'right',
      }}>
        ${cost.toFixed(cost < 1 ? 1 : 0)}
      </span>
    </div>
  );
};

const BudgetBar: React.FC<{ pct: number; color: string; overBudget: boolean; frame: number }> = ({ pct, color, overBudget, frame }) => {
  const pulse = overBudget ? (Math.sin(frame * 0.25) + 1) * 0.15 : 0;
  return (
    <div style={{ height: 4, borderRadius: 2, background: '#1a1a2e', overflow: 'hidden', marginBottom: 6 }}>
      <div style={{
        height: '100%', borderRadius: 2, width: `${Math.min(pct, 100)}%`,
        background: overBudget
          ? `linear-gradient(90deg, ${COLORS.red}, #ff6080)`
          : `linear-gradient(90deg, ${color}80, ${color})`,
        boxShadow: overBudget ? `0 0 ${8 + pulse * 12}px ${COLORS.red}80` : 'none',
      }} />
    </div>
  );
};

const Panel: React.FC<{ side: 'left' | 'right'; frame: number; fps: number }> = ({ side, frame, fps }) => {
  const isRight = side === 'right';
  const headerColor = isRight ? COLORS.green : COLORS.red;

  let runningCost = 0;
  let count = 0;
  const frozen = !isRight && frame >= FREEZE_FRAME;

  const maxIdx = isRight ? allRequests.length : opusBudgetHitIdx;
  for (let i = 0; i < maxIdx; i++) {
    if (frame >= reqFrame(i)) {
      runningCost += isRight ? allRequests[i].costNadir : allRequests[i].costOpus;
      count++;
    }
  }

  if (isRight) {
    // After left freezes, right continues
  }

  const pct = (runningCost / BUDGET) * 100;
  const overBudget = !isRight && frozen;

  // Determine visible window (last N rows, scrolling up)
  const visibleReqs: { req: ReqRow; globalIdx: number }[] = [];
  const limit = isRight ? allRequests.length : opusBudgetHitIdx;
  for (let i = 0; i < limit; i++) {
    if (frame >= reqFrame(i)) {
      visibleReqs.push({ req: allRequests[i], globalIdx: i });
    }
  }
  const startSlice = Math.max(0, visibleReqs.length - VISIBLE_ROWS);
  const displayReqs = visibleReqs.slice(startSlice);

  return (
    <div style={{
      width: HALF - DIVIDER / 2, height: H, display: 'flex', flexDirection: 'column',
      padding: '28px 20px 20px', background: isRight ? COLORS.bgRight : COLORS.bgLeft,
      position: 'relative', overflow: 'hidden',
    }}>
      <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(ellipse at 50% 80%, ${headerColor}06 0%, transparent 60%)`, pointerEvents: 'none' }} />

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: headerColor, boxShadow: `0 0 10px ${headerColor}60` }} />
          <span style={{ fontSize: 22, fontWeight: 800, color: headerColor }}>{isRight ? 'With Nadir' : 'Without Nadir'}</span>
        </div>
        <span style={{ fontSize: 12, color: COLORS.muted }}>
          {isRight ? 'Intelligent routing' : 'All → Claude Opus'}
        </span>
      </div>

      {/* Budget bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
        <span style={{ fontSize: 10, color: COLORS.muted, letterSpacing: 1 }}>BUDGET ${BUDGET}/day</span>
        <span style={{ fontSize: 10, color: overBudget ? COLORS.red : headerColor, fontWeight: 700 }}>
          {overBudget ? 'EXCEEDED' : count > 0 ? `${Math.round(pct)}%` : ''}
        </span>
      </div>
      <BudgetBar pct={pct} color={headerColor} overBudget={overBudget} frame={frame} />

      {/* Request counter */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 11, color: COLORS.muted }}>👥 15 engineers</span>
          <span style={{
            fontSize: 13, fontWeight: 700, color: headerColor,
            fontFamily: '"SF Mono", monospace',
          }}>
            {count} requests
          </span>
        </div>
        <span style={{
          fontSize: 28, fontWeight: 800, color: headerColor,
          fontFamily: '"SF Mono", monospace', letterSpacing: -1,
        }}>
          ${Math.round(runningCost)}
        </span>
      </div>

      {/* Column headers */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '4px 10px', borderBottom: `1px solid ${COLORS.cardBorder}`,
        marginBottom: 2,
      }}>
        <span style={{ fontSize: 9, color: COLORS.muted, letterSpacing: 1, width: 20 }}></span>
        <span style={{ fontSize: 9, color: COLORS.muted, letterSpacing: 1, width: 52 }}>USER</span>
        {isRight && <span style={{ fontSize: 9, color: COLORS.muted, letterSpacing: 1, width: 6 }}></span>}
        <span style={{ fontSize: 9, color: COLORS.muted, letterSpacing: 1, flex: 1 }}>PROMPT</span>
        <span style={{ fontSize: 9, color: COLORS.muted, letterSpacing: 1, width: 44, textAlign: 'center' }}>MODEL</span>
        <span style={{ fontSize: 9, color: COLORS.muted, letterSpacing: 1, width: 40, textAlign: 'right' }}>COST</span>
      </div>

      {/* Log feed */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
        {/* Fade at top */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 24, background: `linear-gradient(to bottom, ${isRight ? COLORS.bgRight : COLORS.bgLeft}, transparent)`, zIndex: 2, pointerEvents: 'none' }} />

        {displayReqs.map(({ req, globalIdx }, i) => {
          const age = displayReqs.length - i;
          const opacity = age <= 1 ? 1 : age <= 3 ? 0.9 : age <= 8 ? 0.6 : 0.35;
          return (
            <LogRow key={globalIdx} req={req} index={globalIdx} side={side} opacity={opacity} />
          );
        })}

        {/* Frozen overlay */}
        {frozen && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            background: 'rgba(12,8,18,0.85)', zIndex: 3,
          }}>
            <span style={{ fontSize: 72, lineHeight: 1, marginBottom: 12 }}>
              {Math.sin(frame * 0.15) > 0 ? '😭' : '😰'}
            </span>
            <span style={{ fontSize: 18, fontWeight: 800, color: COLORS.red, letterSpacing: 2, marginBottom: 4 }}>
              DAILY BUDGET EXCEEDED
            </span>
            <span style={{ fontSize: 13, color: COLORS.muted }}>
              Requests blocked until tomorrow
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

const ResultsBanner: React.FC<{ frame: number; fps: number }> = ({ frame, fps }) => {
  const bannerFrame = reqFrame(allRequests.length - 1) + 30;
  if (frame < bannerFrame) return null;

  const progress = spring({ frame: frame - bannerFrame, fps, config: { damping: 14, stiffness: 100 } });
  const scale = interpolate(progress, [0, 1], [0.85, 1]);
  const opacity = interpolate(progress, [0, 1], [0, 1]);

  let nadirTotal = 0;
  for (const r of allRequests) nadirTotal += r.costNadir;
  const nadirCount = allRequests.length;

  return (
    <div style={{
      position: 'absolute', top: '50%', left: '50%',
      transform: `translate(-50%, -50%) scale(${scale})`,
      opacity, zIndex: 20,
      background: 'linear-gradient(135deg, rgba(0,232,157,0.14) 0%, rgba(0,229,255,0.08) 100%)',
      border: `2px solid ${COLORS.green}40`,
      borderRadius: 20, padding: '28px 48px',
      display: 'flex', alignItems: 'center', gap: 28,
      backdropFilter: 'blur(16px)',
      boxShadow: '0 12px 48px rgba(0,0,0,0.7)',
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <span style={{ fontSize: 48, fontWeight: 900, color: COLORS.red, fontFamily: '"SF Mono", monospace' }}>{opusBudgetHitIdx}</span>
        <span style={{ fontSize: 11, color: COLORS.muted, letterSpacing: 1.5, textTransform: 'uppercase' }}>requests</span>
      </div>
      <span style={{ fontSize: 28, color: COLORS.muted, fontWeight: 300 }}>vs</span>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <span style={{ fontSize: 48, fontWeight: 900, color: COLORS.green, fontFamily: '"SF Mono", monospace' }}>{nadirCount}</span>
        <span style={{ fontSize: 11, color: COLORS.muted, letterSpacing: 1.5, textTransform: 'uppercase' }}>requests</span>
      </div>
      <div style={{ borderLeft: `1px solid ${COLORS.divider}`, paddingLeft: 24 }}>
        <span style={{ fontSize: 22, fontWeight: 700, color: COLORS.white, lineHeight: 1.5 }}>
          Same ${BUDGET} budget.<br />
          <span style={{ color: COLORS.green, fontSize: 24 }}>{Math.round(nadirCount / opusBudgetHitIdx)}x more requests.</span>
        </span>
      </div>
    </div>
  );
};

const NadirLogo: React.FC<{ frame: number; fps: number }> = ({ frame, fps }) => {
  const opacity = interpolate(spring({ frame, fps, config: { damping: 20, stiffness: 100 } }), [0, 1], [0, 1]);
  return (
    <div style={{ position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)', opacity, zIndex: 10 }}>
      <span style={{ fontSize: 14, fontWeight: 700, color: COLORS.cyan, letterSpacing: 3, textTransform: 'uppercase' }}>
        getnadir.dev
      </span>
    </div>
  );
};

export const SideBySide: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.bg, fontFamily: '-apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", sans-serif' }}>
      <div style={{ display: 'flex', width: '100%', height: '100%' }}>
        <Panel side="left" frame={frame} fps={fps} />
        <div style={{ width: DIVIDER, background: COLORS.divider }} />
        <Panel side="right" frame={frame} fps={fps} />
      </div>

      <ResultsBanner frame={frame} fps={fps} />
      <NadirLogo frame={frame} fps={fps} />
    </AbsoluteFill>
  );
};
