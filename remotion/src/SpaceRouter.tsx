import React from 'react';
import { AbsoluteFill, useCurrentFrame, interpolate, Easing } from 'remotion';

const VB = 128; // viewBox size — small for chunky pixels
const FORK_X = 48;
const FORK_Y = 64;

// Deterministic pseudo-random
const rand = (seed: number) => {
  const x = Math.sin(seed * 9973.13) * 43758.5453;
  return x - Math.floor(x);
};

const Starfield: React.FC<{ frame: number }> = ({ frame }) => {
  const stars = Array.from({ length: 60 }, (_, i) => {
    const speed = 0.15 + rand(i) * 0.35;
    const baseX = rand(i * 2 + 1) * VB;
    const y = Math.floor(rand(i * 3 + 7) * VB);
    const x = Math.floor(((baseX - frame * speed) % VB + VB) % VB);
    const twinkle = (Math.sin((frame + i * 11) * 0.2) + 1) * 0.5;
    const bright = rand(i * 5 + 2) > 0.7;
    const size = bright ? 2 : 1;
    const color = bright
      ? twinkle > 0.5
        ? '#ffffff'
        : '#a0b8ff'
      : twinkle > 0.4
      ? '#c8d4f0'
      : '#607090';
    return <rect key={i} x={x} y={y} width={size} height={size} fill={color} />;
  });
  return <g>{stars}</g>;
};

const Nebula: React.FC = () => (
  <g opacity={0.35}>
    {Array.from({ length: 14 }).map((_, i) => {
      const cx = Math.floor(rand(i * 17 + 3) * VB);
      const cy = Math.floor(rand(i * 23 + 5) * VB);
      const size = 8 + Math.floor(rand(i * 31 + 9) * 14);
      const hue = rand(i) > 0.5 ? '#3a1055' : '#0a2060';
      return <rect key={i} x={cx} y={cy} width={size} height={size} fill={hue} />;
    })}
  </g>
);

// Pixel spaceship pointing right, origin = center
const Ship: React.FC<{ cx: number; cy: number; boost: number; shake: number }> = ({
  cx,
  cy,
  boost,
  shake,
}) => {
  const b = Math.round(boost * 3);
  const sy = Math.round(cy) + (shake ? (Math.sin(shake * 4) > 0 ? 0 : 1) : 0);
  const sx = Math.round(cx);
  return (
    <g shapeRendering="crispEdges">
      {/* flame trail */}
      <rect x={sx - 9 - b} y={sy} width={4 + b} height={1} fill="#ff3020" />
      <rect x={sx - 10 - b * 2} y={sy - 1} width={5 + b * 2} height={1} fill="#ffaa20" />
      <rect x={sx - 9 - b} y={sy + 1} width={4 + b} height={1} fill="#ff3020" />
      <rect x={sx - 8} y={sy - 1} width={1} height={3} fill="#ffec60" />
      {/* body shadow */}
      <rect x={sx - 5} y={sy - 2} width={8} height={1} fill="#3a4358" />
      <rect x={sx - 5} y={sy + 2} width={8} height={1} fill="#3a4358" />
      {/* main hull */}
      <rect x={sx - 6} y={sy - 1} width={10} height={3} fill="#c8d0e0" />
      {/* top/bottom highlights */}
      <rect x={sx - 4} y={sy - 2} width={5} height={1} fill="#8892a8" />
      <rect x={sx - 4} y={sy + 2} width={5} height={1} fill="#8892a8" />
      {/* nose */}
      <rect x={sx + 4} y={sy} width={2} height={1} fill="#e8eef8" />
      <rect x={sx + 6} y={sy} width={1} height={1} fill="#ffffff" />
      {/* cockpit */}
      <rect x={sx - 2} y={sy} width={3} height={1} fill="#00e5ff" />
      <rect x={sx - 1} y={sy} width={1} height={1} fill="#a0faff" />
    </g>
  );
};

const Asteroid: React.FC<{ x: number; y: number; seed: number; frame: number }> = ({
  x,
  y,
  seed,
  frame,
}) => {
  const flick = (Math.sin((frame + seed * 13) * 0.3) + 1) * 0.5;
  const glow = flick > 0.5 ? '#ff5060' : '#ff2030';
  return (
    <g shapeRendering="crispEdges">
      <rect x={x - 1} y={y - 2} width={3} height={1} fill="#5a0a10" />
      <rect x={x - 2} y={y - 1} width={5} height={3} fill="#8a1020" />
      <rect x={x - 1} y={y + 2} width={3} height={1} fill="#5a0a10" />
      <rect x={x} y={y} width={1} height={1} fill={glow} />
    </g>
  );
};

const BlackHole: React.FC<{ cx: number; cy: number; frame: number }> = ({ cx, cy, frame }) => {
  const r = 6;
  const pulse = Math.sin(frame * 0.15) * 0.5 + 0.5;
  return (
    <g shapeRendering="crispEdges">
      {/* outer ring */}
      <circle cx={cx} cy={cy} r={r + 2} fill="none" stroke="#a020e0" strokeWidth={1} opacity={0.5 + pulse * 0.5} />
      <circle cx={cx} cy={cy} r={r + 1} fill="none" stroke="#6010a0" strokeWidth={1} />
      {/* event horizon */}
      <circle cx={cx} cy={cy} r={r} fill="#120420" />
      <circle cx={cx} cy={cy} r={r - 2} fill="#000000" />
      {/* accretion rim */}
      <rect x={cx - r - 2} y={cy} width={1} height={1} fill="#ff40ff" />
      <rect x={cx + r + 1} y={cy} width={1} height={1} fill="#ff40ff" />
      <rect x={cx} y={cy - r - 2} width={1} height={1} fill="#ff40ff" />
      <rect x={cx} y={cy + r + 1} width={1} height={1} fill="#ff40ff" />
    </g>
  );
};

// Dashed path drawn as integer rect segments
const DashedPath: React.FC<{
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  glow?: string;
  dash?: number;
  gap?: number;
  offset?: number;
  thick?: number;
}> = ({ x1, y1, x2, y2, color, glow, dash = 3, gap = 2, offset = 0, thick = 1 }) => {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  const steps = Math.floor(len);
  const segs: React.ReactElement[] = [];
  for (let i = 0; i < steps; i++) {
    const t = (i + offset) % (dash + gap);
    if (t < dash) {
      const px = Math.round(x1 + (dx * i) / len);
      const py = Math.round(y1 + (dy * i) / len);
      if (glow) {
        segs.push(
          <rect key={`g${i}`} x={px - 1} y={py - 1} width={thick + 2} height={thick + 2} fill={glow} opacity={0.25} />
        );
      }
      segs.push(
        <rect key={`d${i}`} x={px} y={py} width={thick} height={thick} fill={color} />
      );
    }
  }
  return <g shapeRendering="crispEdges">{segs}</g>;
};

// Chunky beacon/arrow indicator
const Beacon: React.FC<{ x: number; y: number; frame: number; active: boolean }> = ({
  x,
  y,
  frame,
  active,
}) => {
  if (!active) return null;
  const pulse = (Math.sin(frame * 0.4) + 1) * 0.5;
  const opacity = 0.4 + pulse * 0.6;
  return (
    <g shapeRendering="crispEdges" opacity={opacity}>
      {/* glow halo */}
      <rect x={x - 4} y={y - 4} width={9} height={9} fill="#00e5ff" opacity={0.15} />
      <rect x={x - 3} y={y - 3} width={7} height={7} fill="#00e5ff" opacity={0.25} />
      {/* down-pointing arrow */}
      <rect x={x - 2} y={y - 2} width={5} height={1} fill="#a0faff" />
      <rect x={x - 1} y={y - 1} width={3} height={1} fill="#00e5ff" />
      <rect x={x} y={y} width={1} height={1} fill="#ffffff" />
      <rect x={x - 2} y={y + 1} width={5} height={1} fill="#00e5ff" />
      <rect x={x - 1} y={y + 2} width={3} height={1} fill="#a0faff" />
    </g>
  );
};

export const SpaceRouter: React.FC = () => {
  const frame = useCurrentFrame();

  // --- ship trajectory ---
  // approach: -16 → FORK_X
  const approachX = interpolate(frame, [0, 45], [-16, FORK_X], {
    extrapolateRight: 'clamp',
  });
  // drift up toward danger (frames 35-60)
  const driftUpY = interpolate(frame, [35, 60], [FORK_Y, FORK_Y - 6], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.inOut(Easing.ease),
  });
  // bank down onto optimal path (frames 60-90)
  const bankY = interpolate(frame, [60, 90], [FORK_Y - 6, FORK_Y + 22], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.inOut(Easing.cubic),
  });
  // exit along optimal path
  const exitX = interpolate(frame, [60, 150], [FORK_X, 160], {
    extrapolateLeft: 'clamp',
    easing: Easing.out(Easing.quad),
  });
  const exitY = interpolate(frame, [90, 150], [FORK_Y + 22, FORK_Y + 30], {
    extrapolateLeft: 'clamp',
  });

  const shipX = frame < 60 ? approachX : exitX;
  const shipY = frame < 60 ? driftUpY : frame < 90 ? bankY : exitY;

  // boost during redirect + exit
  const boost = interpolate(frame, [70, 90, 150], [0, 1, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // hesitation shake
  const shake = frame >= 45 && frame < 65 ? frame : 0;

  // beacon appears when ship nears fork and fades after redirect
  const beaconActive = frame >= 40 && frame < 88;

  // danger flash
  const dangerFlash = frame >= 50 && frame < 72 ? (Math.sin(frame * 0.8) + 1) * 0.5 : 0;

  // dashed path animation
  const dashOffset = Math.floor(frame * 0.3) % 5;

  return (
    <AbsoluteFill style={{ backgroundColor: '#060318' }}>
      <svg
        viewBox={`0 0 ${VB} ${VB}`}
        width="100%"
        height="100%"
        style={{
          imageRendering: 'pixelated',
          width: '100%',
          height: '100%',
        }}
        shapeRendering="crispEdges"
      >
        {/* bg gradient bands */}
        <rect x={0} y={0} width={VB} height={VB} fill="#060318" />
        <rect x={0} y={0} width={VB} height={32} fill="#0a0525" />
        <rect x={0} y={96} width={VB} height={32} fill="#080420" />

        <Nebula />
        <Starfield frame={frame} />

        {/* trunk path from left edge to fork */}
        <DashedPath
          x1={0}
          y1={FORK_Y}
          x2={FORK_X}
          y2={FORK_Y}
          color="#4a5578"
          dash={3}
          gap={2}
          offset={dashOffset}
        />

        {/* DANGER PATH 1 — top (asteroids) */}
        <DashedPath
          x1={FORK_X}
          y1={FORK_Y}
          x2={128}
          y2={24}
          color={dangerFlash > 0.5 ? '#ff5060' : '#8a2030'}
          dash={2}
          gap={3}
          offset={dashOffset}
        />
        {/* asteroid field on top path */}
        {[
          [66, 54],
          [76, 46],
          [86, 38],
          [96, 32],
          [108, 26],
          [72, 50],
          [92, 36],
          [82, 42],
        ].map(([ax, ay], i) => (
          <Asteroid key={i} x={ax} y={ay} seed={i} frame={frame} />
        ))}

        {/* DANGER PATH 2 — middle (black hole) */}
        <DashedPath
          x1={FORK_X}
          y1={FORK_Y}
          x2={128}
          y2={FORK_Y - 4}
          color={dangerFlash > 0.5 ? '#ff40a0' : '#6010a0'}
          dash={2}
          gap={3}
          offset={dashOffset}
        />
        <BlackHole cx={92} cy={60} frame={frame} />

        {/* OPTIMAL PATH — bottom (cyan) */}
        {/* glow layer */}
        <DashedPath
          x1={FORK_X}
          y1={FORK_Y}
          x2={130}
          y2={FORK_Y + 32}
          color="#00e5ff"
          glow="#00e5ff"
          dash={4}
          gap={1}
          offset={dashOffset}
          thick={1}
        />
        {/* brighter beads along optimal path */}
        {[0.2, 0.45, 0.7, 0.9].map((t, i) => {
          const px = Math.round(FORK_X + (130 - FORK_X) * t);
          const py = Math.round(FORK_Y + 32 * t);
          const p = (Math.sin((frame + i * 10) * 0.2) + 1) * 0.5;
          return (
            <g key={`bead${i}`}>
              <rect x={px - 1} y={py - 1} width={3} height={3} fill="#00e5ff" opacity={0.3 * p} />
              <rect x={px} y={py} width={1} height={1} fill="#a0faff" />
            </g>
          );
        })}

        {/* fork node */}
        <g shapeRendering="crispEdges">
          <rect x={FORK_X - 2} y={FORK_Y - 2} width={5} height={5} fill="#00e5ff" opacity={0.25} />
          <rect x={FORK_X - 1} y={FORK_Y - 1} width={3} height={3} fill="#00e5ff" />
          <rect x={FORK_X} y={FORK_Y} width={1} height={1} fill="#ffffff" />
        </g>

        {/* redirect beacon near fork pointing toward optimal */}
        <Beacon x={FORK_X + 6} y={FORK_Y + 10} frame={frame} active={beaconActive} />

        {/* scanner ring pulse around ship during hesitation */}
        {frame >= 40 && frame < 70 && (
          <g opacity={0.5}>
            <rect
              x={Math.round(shipX) - 10}
              y={Math.round(shipY) - 10}
              width={21}
              height={21}
              fill="none"
              stroke="#00e5ff"
              strokeWidth={1}
              opacity={(Math.sin(frame * 0.4) + 1) * 0.3}
            />
          </g>
        )}

        {/* SHIP */}
        <Ship cx={shipX} cy={shipY} boost={boost} shake={shake} />

        {/* HUD corner brackets for cinematic feel */}
        <g shapeRendering="crispEdges" opacity={0.4}>
          <rect x={2} y={2} width={6} height={1} fill="#00e5ff" />
          <rect x={2} y={2} width={1} height={6} fill="#00e5ff" />
          <rect x={VB - 8} y={2} width={6} height={1} fill="#00e5ff" />
          <rect x={VB - 3} y={2} width={1} height={6} fill="#00e5ff" />
          <rect x={2} y={VB - 3} width={6} height={1} fill="#00e5ff" />
          <rect x={2} y={VB - 8} width={1} height={6} fill="#00e5ff" />
          <rect x={VB - 8} y={VB - 3} width={6} height={1} fill="#00e5ff" />
          <rect x={VB - 3} y={VB - 8} width={1} height={6} fill="#00e5ff" />
        </g>
      </svg>
    </AbsoluteFill>
  );
};
