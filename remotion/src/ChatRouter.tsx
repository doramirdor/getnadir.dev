import React from 'react';
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
} from 'remotion';

// -----------------------------------------------------------------------------
// Story: same customer support conversation runs on two backends simultaneously.
// Left  = hand-tiered GPT stack (GPT-5-mini / GPT-5.2 / GPT-5.4 per tier).
// Right = Nadir routes each turn to the right tier (Haiku / Sonnet / Opus).
// The cost accumulators on each side diverge in real time.
// -----------------------------------------------------------------------------

type Tier = 'simple' | 'mid' | 'complex';

interface Turn {
  user: string;
  bot: string;
  tier: Tier;
  // USD cost for this single turn, rounded to 4 decimal places.
  costGpt: number;
  costNadir: number;
}

// Per-turn cost (USD). Both columns reflect the same *tier-appropriate*
// model on each side — cheap for simple, mid for mid, flagship for complex.
// Left column: the OpenAI ladder (GPT-5-mini / GPT-5.2 / GPT-5.4).
// Right column: what Nadir auto-routes to on the Claude ladder.
// Story: even a hand-tiered GPT stack costs meaningfully more than Nadir
// auto-routing Claude, turn for turn.
const TURNS: Turn[] = [
  {
    user: 'Hi 👋',
    bot: 'Hi there! How can I help you today?',
    tier: 'simple',
    costGpt: 0.00012,
    costNadir: 0.00008,
  },
  {
    user: "What's the status of my order #4829?",
    bot: "Out for delivery, arriving Thursday by 5pm.\nTracking: 1Z45A2FG8Q",
    tier: 'simple',
    costGpt: 0.00055,
    costNadir: 0.00038,
  },
  {
    user: 'Can I change the shipping address?',
    bot: "Yes, as long as it hasn't been handed to the courier. What's the new address?",
    tier: 'mid',
    costGpt: 0.0045,
    costNadir: 0.00284,
  },
  {
    user:
      'I was charged twice for my annual plan, on my Visa and the card ending 4411. Can you investigate, refund the duplicate, and explain why?',
    bot:
      "Found it. Your card update triggered a re-auth before the old charge settled, a classic double-pull.\nI'm refunding $99 to the Visa (5 to 7 business days) and flagging your account so this can't repeat. Anything else?",
    tier: 'complex',
    costGpt: 0.0485,
    costNadir: 0.0118,
  },
];

// -----------------------------------------------------------------------------
// Timeline (30fps)
// -----------------------------------------------------------------------------

const FPS = 30;
const INTRO = 30;
const USER_TYPE = 28;
const USER_HOLD = 10;
const BOT_THINKING = 22;
const BOT_TYPE_BASE = 32;
const BOT_HOLD = 18;
const RESULTS_AT = computeResultsFrame();

function computeResultsFrame(): number {
  let f = INTRO;
  for (const turn of TURNS) {
    f += USER_TYPE + USER_HOLD + BOT_THINKING + botTypeDuration(turn) + BOT_HOLD;
  }
  return f;
}

function botTypeDuration(turn: Turn): number {
  // Longer responses get more frames, capped so complex turn still fits.
  return Math.min(80, BOT_TYPE_BASE + Math.floor(turn.bot.length / 6));
}

interface TurnWindow {
  startFrame: number;
  userTypeEnd: number;
  userSentFrame: number;
  botTypeStart: number;
  botTypeEnd: number;
  endFrame: number;
}

const TURN_WINDOWS: TurnWindow[] = (() => {
  const out: TurnWindow[] = [];
  let cursor = INTRO;
  for (const turn of TURNS) {
    const startFrame = cursor;
    const userTypeEnd = startFrame + USER_TYPE;
    const userSentFrame = userTypeEnd + USER_HOLD;
    const botTypeStart = userSentFrame + BOT_THINKING;
    const botTypeEnd = botTypeStart + botTypeDuration(turn);
    const endFrame = botTypeEnd + BOT_HOLD;
    out.push({ startFrame, userTypeEnd, userSentFrame, botTypeStart, botTypeEnd, endFrame });
    cursor = endFrame;
  }
  return out;
})();

// -----------------------------------------------------------------------------
// Theme palette. Two variants share the same shape so every component can
// pull from `useTheme()` and render identically on a dark or light background.
// -----------------------------------------------------------------------------

interface Theme {
  bg: string;
  bgLeft: string;
  bgRight: string;
  chatBgLeft: string;
  chatBgRight: string;
  red: string;
  green: string;
  cyan: string;
  textPrimary: string;
  muted: string;
  mutedLight: string;
  divider: string;
  cardBg: string;
  cardBorder: string;
  rowDisabled: string;
  userBubble: string;
  userBubbleBorder: string;
  botBubble: string;
  botBubbleBorder: string;
  userAvatarBg: string;
  userAvatarText: string;
  botAvatarBg: string;
  botAvatarBorder: string;
  tierSimple: string;
  tierMid: string;
  tierComplex: string;
  tierBadgeText: string;
  bannerBg: string;
  bannerBorder: string;
  bannerShadow: string;
  bannerAccentBg: string;
  bannerAccentBorder: string;
  radialAccentOpacity: number;
}

const DARK_THEME: Theme = {
  bg: '#0a0a0f',
  bgLeft: '#0c0812',
  bgRight: '#080f12',
  chatBgLeft: '#0a060e',
  chatBgRight: '#060a0c',
  red: '#ff3b5c',
  green: '#00e89d',
  cyan: '#00e5ff',
  textPrimary: '#f0f0f5',
  muted: '#6b7094',
  mutedLight: '#9498b8',
  divider: '#1a1a2e',
  cardBg: '#12121e',
  cardBorder: '#1e1e34',
  rowDisabled: '#2a2f48',
  userBubble: '#1f2540',
  userBubbleBorder: '#2a3052',
  botBubble: '#141420',
  botBubbleBorder: '#1e1e34',
  userAvatarBg: 'linear-gradient(135deg, #4c5a99, #2e3a66)',
  userAvatarText: '#f0f0f5',
  botAvatarBg: 'linear-gradient(135deg, #1a1f2e, #0f1420)',
  botAvatarBorder: 'rgba(0,229,255,0.4)',
  tierSimple: '#00e89d',
  tierMid: '#ffaa20',
  tierComplex: '#ff5070',
  tierBadgeText: '#061015',
  bannerBg:
    'linear-gradient(135deg, rgba(0,232,157,0.14) 0%, rgba(0,229,255,0.08) 100%)',
  bannerBorder: 'rgba(0,232,157,0.5)',
  bannerShadow: '0 20px 60px rgba(0,0,0,0.75)',
  bannerAccentBg: 'rgba(0,232,157,0.1)',
  bannerAccentBorder: 'rgba(0,232,157,0.4)',
  radialAccentOpacity: 0.08,
};

const LIGHT_THEME: Theme = {
  bg: '#f7f8fa',
  bgLeft: '#fef7f9',
  bgRight: '#f0fbf7',
  chatBgLeft: '#fff5f6',
  chatBgRight: '#ecfdf5',
  red: '#dc2626',
  green: '#059669',
  cyan: '#0891b2',
  textPrimary: '#0f172a',
  muted: '#64748b',
  mutedLight: '#94a3b8',
  divider: '#e2e8f0',
  cardBg: '#ffffff',
  cardBorder: '#e5e7eb',
  rowDisabled: '#cbd5e1',
  userBubble: '#e0e7ff',
  userBubbleBorder: '#c7d2fe',
  botBubble: '#ffffff',
  botBubbleBorder: '#e5e7eb',
  userAvatarBg: 'linear-gradient(135deg, #6366f1, #4338ca)',
  userAvatarText: '#ffffff',
  botAvatarBg: 'linear-gradient(135deg, #f1f5f9, #e2e8f0)',
  botAvatarBorder: '#0891b2',
  tierSimple: '#059669',
  tierMid: '#d97706',
  tierComplex: '#dc2626',
  tierBadgeText: '#ffffff',
  bannerBg:
    'linear-gradient(135deg, rgba(5,150,105,0.12) 0%, rgba(8,145,178,0.08) 100%)',
  bannerBorder: 'rgba(5,150,105,0.5)',
  bannerShadow: '0 20px 60px rgba(15,23,42,0.18)',
  bannerAccentBg: 'rgba(5,150,105,0.10)',
  bannerAccentBorder: 'rgba(5,150,105,0.35)',
  radialAccentOpacity: 0.05,
};

const ThemeContext = React.createContext<Theme>(DARK_THEME);
const useTheme = () => React.useContext(ThemeContext);

const tierColor = (theme: Theme, tier: Tier): string =>
  tier === 'simple' ? theme.tierSimple : tier === 'mid' ? theme.tierMid : theme.tierComplex;

const NADIR_MODEL: Record<Tier, string> = {
  simple: 'Haiku',
  mid: 'Sonnet',
  complex: 'Opus',
};

const GPT_MODEL: Record<Tier, string> = {
  simple: 'GPT-5-mini',
  mid: 'GPT-5.2',
  complex: 'GPT-5.4',
};

// Backwards-compat alias: Nadir side used to be the only tiered column.
const TIER_MODEL = NADIR_MODEL;

const TIER_LABEL: Record<Tier, string> = {
  simple: 'SIMPLE',
  mid: 'MID',
  complex: 'COMPLEX',
};

// Monthly scale projection shown on the results banner.
const SCALE_RUNS_PER_MONTH = 300_000;

// -----------------------------------------------------------------------------
// Utility: substring reveal for typing animation
// -----------------------------------------------------------------------------

function revealText(full: string, progress: number): string {
  const chars = Math.floor(full.length * progress);
  return full.slice(0, chars);
}

// -----------------------------------------------------------------------------
// How far into the current conversation we are.
// Used by both panels (chat + cost) to stay perfectly synced.
// -----------------------------------------------------------------------------

interface TurnState {
  index: number;
  userText: string;
  userVisible: boolean;
  userSent: boolean;
  botThinking: boolean;
  botText: string;
  botDone: boolean;
  turnFullyDone: boolean;
}

function computeTurnStates(frame: number): TurnState[] {
  return TURNS.map((turn, i) => {
    const w = TURN_WINDOWS[i];
    if (frame < w.startFrame) {
      return {
        index: i,
        userText: '',
        userVisible: false,
        userSent: false,
        botThinking: false,
        botText: '',
        botDone: false,
        turnFullyDone: false,
      };
    }

    const userProgress = interpolate(
      frame,
      [w.startFrame, w.userTypeEnd],
      [0, 1],
      { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
    );
    const userText = revealText(turn.user, userProgress);
    const userSent = frame >= w.userSentFrame;
    const botThinking = frame >= w.userSentFrame && frame < w.botTypeStart;

    const botProgress = interpolate(
      frame,
      [w.botTypeStart, w.botTypeEnd],
      [0, 1],
      { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
    );
    const botText = frame >= w.botTypeStart ? revealText(turn.bot, botProgress) : '';
    const botDone = frame >= w.botTypeEnd;
    const turnFullyDone = frame >= w.endFrame;

    return {
      index: i,
      userText,
      userVisible: true,
      userSent,
      botThinking,
      botText,
      botDone,
      turnFullyDone,
    };
  });
}

// -----------------------------------------------------------------------------
// Components
// -----------------------------------------------------------------------------

const Avatar: React.FC<{ variant: 'user' | 'bot'; size?: number }> = ({ variant, size = 32 }) => {
  const theme = useTheme();
  if (variant === 'user') {
    return (
      <div
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          background: theme.userAvatarBg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: size * 0.5,
          color: theme.userAvatarText,
          fontWeight: 700,
          flexShrink: 0,
        }}
      >
        J
      </div>
    );
  }
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: theme.botAvatarBg,
        border: `1.5px solid ${theme.botAvatarBorder}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size * 0.5,
        flexShrink: 0,
      }}
    >
      🤖
    </div>
  );
};

const TypingIndicator: React.FC<{ frame: number }> = ({ frame }) => {
  const theme = useTheme();
  const dot = (offset: number) => {
    const phase = (frame + offset) * 0.2;
    const y = Math.sin(phase) * 3;
    const opacity = 0.4 + (Math.sin(phase) + 1) * 0.3;
    return (
      <div
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: theme.mutedLight,
          transform: `translateY(${y}px)`,
          opacity,
        }}
      />
    );
  };
  return (
    <div style={{ display: 'flex', gap: 5, padding: '10px 14px' }}>
      {dot(0)}
      {dot(2)}
      {dot(4)}
    </div>
  );
};

const Bubble: React.FC<{
  variant: 'user' | 'bot';
  text: string;
  tierBadge?: Tier;
  showCursor?: boolean;
}> = ({ variant, text, tierBadge, showCursor }) => {
  const theme = useTheme();
  const isUser = variant === 'user';
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: isUser ? 'row-reverse' : 'row',
        gap: 12,
        alignItems: 'flex-end',
        maxWidth: '85%',
        marginLeft: isUser ? 'auto' : 0,
        marginRight: isUser ? 0 : 'auto',
      }}
    >
      <Avatar variant={variant} />
      <div
        style={{
          background: isUser ? theme.userBubble : theme.botBubble,
          color: theme.textPrimary,
          padding: '12px 16px',
          borderRadius: isUser ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
          fontSize: 18,
          lineHeight: 1.45,
          border: `1px solid ${isUser ? theme.userBubbleBorder : theme.botBubbleBorder}`,
          whiteSpace: 'pre-wrap',
          position: 'relative',
        }}
      >
        {text}
        {showCursor && (
          <span
            style={{
              display: 'inline-block',
              width: 2,
              height: 16,
              background: theme.cyan,
              marginLeft: 2,
              verticalAlign: 'text-bottom',
              animation: 'blink 1s infinite',
            }}
          />
        )}
        {tierBadge && (
          <div
            style={{
              position: 'absolute',
              top: -10,
              right: isUser ? 'auto' : 10,
              left: isUser ? 10 : 'auto',
              background: tierColor(theme, tierBadge),
              color: theme.tierBadgeText,
              fontSize: 10,
              fontWeight: 800,
              padding: '2px 8px',
              borderRadius: 10,
              letterSpacing: 1,
            }}
          >
            {TIER_LABEL[tierBadge]} → {TIER_MODEL[tierBadge]}
          </div>
        )}
      </div>
    </div>
  );
};

// -----------------------------------------------------------------------------
// Pricing / routing panel (top half of each side)
// -----------------------------------------------------------------------------

interface CostLine {
  index: number;
  turn: Turn;
  model: string;
  amount: number;
  highlighted: boolean;
}

const CostPanel: React.FC<{
  side: 'left' | 'right';
  frame: number;
  states: TurnState[];
}> = ({ side, frame, states }) => {
  const theme = useTheme();
  const isRight = side === 'right';
  const headerColor = isRight ? theme.green : theme.red;
  const radialAlpha = Math.round(theme.radialAccentOpacity * 255)
    .toString(16)
    .padStart(2, '0');

  // A turn counts toward the total only once the bot response has *landed*.
  // That way the cost ticks up at the exact moment the reply appears on screen.
  const completedTurns = TURNS.map((turn, i) => ({
    turn,
    visible: states[i].botDone,
    highlighted: states[i].botDone && !states[i].turnFullyDone,
  }));

  const visibleLines: CostLine[] = completedTurns
    .map(({ turn, visible, highlighted }, i) =>
      visible
        ? {
            index: i,
            turn,
            model: isRight ? NADIR_MODEL[turn.tier] : GPT_MODEL[turn.tier],
            amount: isRight ? turn.costNadir : turn.costGpt,
            highlighted,
          }
        : null,
    )
    .filter((x): x is CostLine => x !== null);

  const runningTotal = visibleLines.reduce((a, b) => a + b.amount, 0);

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        padding: '28px 32px 20px',
        background: isRight ? theme.bgRight : theme.bgLeft,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `radial-gradient(ellipse at 50% 20%, ${headerColor}${radialAlpha} 0%, transparent 60%)`,
          pointerEvents: 'none',
        }}
      />

      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 18,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: headerColor,
              boxShadow: `0 0 12px ${headerColor}70`,
            }}
          />
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 22, fontWeight: 800, color: headerColor, letterSpacing: -0.3 }}>
              {isRight ? 'With Nadir' : 'Without Nadir'}
            </span>
            <span style={{ fontSize: 12, color: theme.muted, marginTop: 2 }}>
              {isRight
                ? 'Nadir auto-routes on the Claude ladder'
                : 'Hand-tiered on the OpenAI ladder'}
            </span>
          </div>
        </div>
      </div>

      {/* Running total */}
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          marginBottom: 16,
          paddingBottom: 14,
          borderBottom: `1px solid ${theme.cardBorder}`,
        }}
      >
        <span
          style={{
            fontSize: 10,
            color: theme.muted,
            letterSpacing: 1.5,
            textTransform: 'uppercase',
          }}
        >
          Cost so far
        </span>
        <span
          style={{
            fontSize: 44,
            fontWeight: 900,
            color: headerColor,
            fontFamily: '"SF Mono", ui-monospace, monospace',
            letterSpacing: -1.5,
          }}
        >
          ${runningTotal.toFixed(4)}
        </span>
      </div>

      {/* Per-turn breakdown */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div
          style={{
            display: 'flex',
            fontSize: 9,
            color: theme.muted,
            letterSpacing: 1.5,
            paddingBottom: 4,
          }}
        >
          <span style={{ width: 36 }}>#</span>
          {isRight && <span style={{ width: 80 }}>TIER</span>}
          <span style={{ flex: 1 }}>MODEL</span>
          <span style={{ width: 100, textAlign: 'right' }}>COST</span>
        </div>
        {TURNS.map((turn, i) => {
          const line = visibleLines.find((l) => l.index === i);
          const appeared = Boolean(line);
          const pulseStrength = line?.highlighted
            ? (Math.sin(frame * 0.4) + 1) * 0.5
            : 0;
          return (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                fontSize: 15,
                fontFamily: '"SF Mono", ui-monospace, monospace',
                color: appeared ? theme.textPrimary : theme.rowDisabled,
                padding: '6px 0',
                opacity: appeared ? 1 : 0.35,
                transition: 'opacity 200ms',
              }}
            >
              <span style={{ width: 36, color: theme.muted }}>{String(i + 1).padStart(2, '0')}</span>
              {isRight && (
                <span style={{ width: 80, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: appeared ? tierColor(theme, turn.tier) : theme.cardBorder,
                    }}
                  />
                  <span
                    style={{
                      color: appeared ? tierColor(theme, turn.tier) : theme.rowDisabled,
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: 0.5,
                    }}
                  >
                    {TIER_LABEL[turn.tier]}
                  </span>
                </span>
              )}
              <span style={{ flex: 1, color: appeared ? theme.mutedLight : theme.rowDisabled }}>
                {appeared ? (isRight ? NADIR_MODEL[turn.tier] : GPT_MODEL[turn.tier]) : '—'}
              </span>
              <span
                style={{
                  width: 100,
                  textAlign: 'right',
                  fontWeight: 700,
                  color: appeared ? headerColor : theme.rowDisabled,
                  textShadow: pulseStrength
                    ? `0 0 ${8 + pulseStrength * 10}px ${headerColor}90`
                    : 'none',
                }}
              >
                {appeared ? `+$${line!.amount.toFixed(4)}` : '—'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// -----------------------------------------------------------------------------
// Chat UI (bottom half of each side)
// -----------------------------------------------------------------------------

const ChatPanel: React.FC<{
  side: 'left' | 'right';
  frame: number;
  states: TurnState[];
}> = ({ side, frame, states }) => {
  const theme = useTheme();
  const isRight = side === 'right';

  // Build the list of messages currently visible on screen.
  // Order: turn 1 user, turn 1 bot, turn 2 user, turn 2 bot, ...
  const messages: React.ReactNode[] = [];
  states.forEach((s, i) => {
    if (!s.userVisible) return;
    const w = TURN_WINDOWS[i];
    const isCurrentlyTypingUser = frame >= w.startFrame && frame < w.userTypeEnd;
    messages.push(
      <Bubble
        key={`u-${i}`}
        variant="user"
        text={s.userText}
        showCursor={isCurrentlyTypingUser}
      />,
    );

    if (s.botThinking) {
      messages.push(
        <div
          key={`t-${i}`}
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            gap: 12,
            maxWidth: '85%',
            marginRight: 'auto',
          }}
        >
          <Avatar variant="bot" />
          <div
            style={{
              background: theme.botBubble,
              border: `1px solid ${theme.botBubbleBorder}`,
              borderRadius: '18px 18px 18px 4px',
            }}
          >
            <TypingIndicator frame={frame} />
          </div>
        </div>,
      );
    } else if (s.botText) {
      const isCurrentlyTypingBot = frame >= w.botTypeStart && frame < w.botTypeEnd;
      // Tier badge only shows on the right side (Nadir), and only once the bot
      // has finished typing (so the badge doesn't distract during reveal).
      const showBadge = isRight && s.botDone;
      messages.push(
        <Bubble
          key={`b-${i}`}
          variant="bot"
          text={s.botText}
          tierBadge={showBadge ? TURNS[i].tier : undefined}
          showCursor={isCurrentlyTypingBot}
        />,
      );
    }
  });

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        padding: '20px 32px 28px',
        background: isRight ? theme.chatBgRight : theme.chatBgLeft,
        borderTop: `1px solid ${theme.divider}`,
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* Chat header strip */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          paddingBottom: 14,
          marginBottom: 14,
          borderBottom: `1px solid ${theme.cardBorder}`,
        }}
      >
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: theme.tierSimple,
            boxShadow: `0 0 8px ${theme.tierSimple}80`,
          }}
        />
        <span style={{ fontSize: 14, fontWeight: 700, color: theme.textPrimary }}>
          Support Bot
        </span>
        <span style={{ fontSize: 12, color: theme.muted }}>online</span>
      </div>

      {/* Messages */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: 18,
          justifyContent: 'flex-end',
          overflow: 'hidden',
        }}
      >
        {messages}
      </div>
    </div>
  );
};

// -----------------------------------------------------------------------------
// Results banner: shown at the end
// -----------------------------------------------------------------------------

const ResultsBanner: React.FC<{ frame: number; fps: number }> = ({ frame, fps }) => {
  const theme = useTheme();
  if (frame < RESULTS_AT) return null;

  const progress = spring({
    frame: frame - RESULTS_AT,
    fps,
    config: { damping: 16, stiffness: 110 },
  });
  const scale = interpolate(progress, [0, 1], [0.9, 1]);
  const opacity = interpolate(progress, [0, 1], [0, 1]);

  const totalGpt = TURNS.reduce((a, b) => a + b.costGpt, 0);
  const totalNadir = TURNS.reduce((a, b) => a + b.costNadir, 0);
  const savedPct = ((totalGpt - totalNadir) / totalGpt) * 100;

  const monthlyGpt = totalGpt * SCALE_RUNS_PER_MONTH;
  const monthlyNadir = totalNadir * SCALE_RUNS_PER_MONTH;
  const monthlySaved = monthlyGpt - monthlyNadir;

  const formatUsd = (n: number) =>
    n >= 1000
      ? `$${(n / 1000).toFixed(1)}k`
      : `$${n.toFixed(n < 10 ? 2 : 0)}`;

  return (
    <div
      style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: `translate(-50%, -50%) scale(${scale})`,
        opacity,
        zIndex: 30,
        background: theme.bannerBg,
        border: `2px solid ${theme.bannerBorder}`,
        borderRadius: 28,
        padding: '44px 64px',
        backdropFilter: 'blur(18px)',
        boxShadow: theme.bannerShadow,
        minWidth: 820,
      }}
    >
      <div
        style={{
          fontSize: 18,
          color: theme.muted,
          letterSpacing: 3,
          textTransform: 'uppercase',
          textAlign: 'center',
          marginBottom: 8,
        }}
      >
        Same conversation. Same quality.
      </div>
      <div
        style={{
          fontSize: 64,
          fontWeight: 900,
          color: theme.green,
          textAlign: 'center',
          letterSpacing: -2,
          marginBottom: 28,
        }}
      >
        {Math.round(savedPct)}% cheaper.
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 40,
          borderTop: `1px solid ${theme.bannerAccentBorder}`,
          paddingTop: 24,
        }}
      >
        <div style={{ flex: 1 }}>
          <div
            style={{
              fontSize: 11,
              color: theme.muted,
              letterSpacing: 1.5,
              textTransform: 'uppercase',
              marginBottom: 8,
            }}
          >
            Support bot at {SCALE_RUNS_PER_MONTH.toLocaleString()} chats/mo
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontFamily: '"SF Mono", monospace',
              fontSize: 18,
              marginBottom: 6,
            }}
          >
            <span style={{ color: theme.muted }}>OpenAI stack</span>
            <span style={{ color: theme.red, fontWeight: 700 }}>
              {formatUsd(monthlyGpt)}/mo
            </span>
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontFamily: '"SF Mono", monospace',
              fontSize: 18,
            }}
          >
            <span style={{ color: theme.muted }}>With Nadir</span>
            <span style={{ color: theme.green, fontWeight: 700 }}>
              {formatUsd(monthlyNadir)}/mo
            </span>
          </div>
          <div
            style={{
              marginTop: 16,
              padding: '12px 16px',
              borderRadius: 10,
              background: theme.bannerAccentBg,
              border: `1px solid ${theme.bannerAccentBorder}`,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span style={{ fontSize: 14, color: theme.textPrimary, fontWeight: 600 }}>
              You keep
            </span>
            <span
              style={{
                fontSize: 28,
                fontWeight: 900,
                color: theme.green,
                fontFamily: '"SF Mono", monospace',
                letterSpacing: -1,
              }}
            >
              {formatUsd(monthlySaved)}/mo
            </span>
          </div>
        </div>
      </div>

      <div
        style={{
          textAlign: 'center',
          marginTop: 28,
          fontSize: 16,
          color: theme.cyan,
          letterSpacing: 3,
          textTransform: 'uppercase',
          fontWeight: 700,
        }}
      >
        getnadir.com
      </div>
    </div>
  );
};

// -----------------------------------------------------------------------------
// Side
// -----------------------------------------------------------------------------

const Side: React.FC<{ side: 'left' | 'right'; frame: number; states: TurnState[] }> = ({
  side,
  frame,
  states,
}) => {
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      <CostPanel side={side} frame={frame} states={states} />
      <ChatPanel side={side} frame={frame} states={states} />
    </div>
  );
};

// -----------------------------------------------------------------------------
// Top-level composition
// -----------------------------------------------------------------------------

export type ChatRouterMode = 'dark' | 'light';

export const ChatRouter: React.FC<{ mode?: ChatRouterMode }> = ({ mode = 'dark' }) => {
  const theme = mode === 'light' ? LIGHT_THEME : DARK_THEME;
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const states = computeTurnStates(frame);

  const introOpacity = interpolate(frame, [0, INTRO], [0, 1], {
    extrapolateRight: 'clamp',
  });

  return (
    <ThemeContext.Provider value={theme}>
      <AbsoluteFill
        style={{
          backgroundColor: theme.bg,
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", sans-serif',
        }}
      >
        <div
          style={{
            display: 'flex',
            width: '100%',
            height: '100%',
            opacity: introOpacity,
          }}
        >
          <Side side="left" frame={frame} states={states} />
          <div style={{ width: 4, background: theme.divider }} />
          <Side side="right" frame={frame} states={states} />
        </div>

        <ResultsBanner frame={frame} fps={fps} />
      </AbsoluteFill>
    </ThemeContext.Provider>
  );
};

export const CHAT_ROUTER_DURATION =
  RESULTS_AT + 150; // 5s for the results card to breathe
