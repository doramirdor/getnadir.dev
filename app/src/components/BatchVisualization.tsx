import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

const SEED_COUNT = 163;
const BATCH_SIZE = 100;
const TOTAL_BATCHES = 5;

const INITIALS = [
  "S","M","P","J","Y","A","N","D","E","B",
  "K","R","T","L","C","H","F","G","I","Q",
  "W","X","V","U","O","Z",
];

// Real user photos from randomuser.me (104 unique photos: 52 women + 52 men)
const PHOTO_URLS = Array.from({ length: 104 }, (_, i) => {
  const gender = i % 2 === 0 ? "women" : "men";
  const num = Math.floor(i / 2) + 1;
  return `https://randomuser.me/api/portraits/thumb/${gender}/${num}.jpg`;
});

const GITHUB_COLORS = [
  "#4078c0","#6cc644","#f5c242","#bd2c00","#6e5494","#0366d6",
  "#28a745","#e36209","#d73a49","#586069","#24292e","#2188ff",
];

const INITIAL_BG = [
  "#8b6f5e","#6b8e7a","#7a7eb5","#b57a7a","#7aa3b5","#9b7ab5",
  "#7ab58c","#b5a07a","#5e8b7a","#8b5e7a","#7a8b5e","#5e7a8b",
];

// Inline SVG: GitHub-style geometric identicon (5x5 symmetric grid)
function githubSvg(seed: number): string {
  const bg = GITHUB_COLORS[seed % GITHUB_COLORS.length];
  let cells = "";
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 3; col++) {
      const on = ((seed * 7 + row * 13 + col * 31) % 5) > 1;
      if (!on) continue;
      const x1 = 4 + col * 8, y = 4 + row * 8;
      cells += `<rect x="${x1}" y="${y}" width="7" height="7" fill="${bg}"/>`;
      if (col < 2) {
        const x2 = 4 + (4 - col) * 8;
        cells += `<rect x="${x2}" y="${y}" width="7" height="7" fill="${bg}"/>`;
      }
    }
  }
  return `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect width="48" height="48" fill="#f0f0f0"/>${cells}</svg>`
  )}`;
}

function buildSeedAvatar(idx: number) {
  // 64% real photos, 12% GitHub-style identicons, 24% initials
  const bucket = idx % 25;
  if (bucket < 16) {
    // Real photo (16/25 = 64%)
    return { type: "img" as const, url: PHOTO_URLS[idx % PHOTO_URLS.length] };
  }
  if (bucket < 19) {
    // GitHub identicon (3/25 = 12%)
    return { type: "img" as const, url: githubSvg(idx) };
  }
  // Initials (6/25 = 24%)
  const text = INITIALS[idx % INITIALS.length];
  const bg = INITIAL_BG[idx % INITIAL_BG.length];
  return { type: "initials" as const, text, bg };
}

function buildRealAvatar(entry: { avatar_url?: string; display_name?: string; email?: string }) {
  if (entry.avatar_url) return { type: "img" as const, url: entry.avatar_url };
  const letter = (entry.display_name || entry.email || "?").charAt(0).toUpperCase();
  const bg = INITIAL_BG[letter.charCodeAt(0) % INITIAL_BG.length];
  return { type: "initials" as const, text: letter, bg };
}

export const BatchVisualization = () => {
  const [visible, setVisible] = useState(false);
  const [realEntries, setRealEntries] = useState<any[]>([]);
  const vizRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase
      .from("waitlist_entries")
      .select("*")
      .order("position", { ascending: true })
      .then(({ data }) => { if (data) setRealEntries(data); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const el = vizRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { threshold: 0.1 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const totalFilled = SEED_COUNT + realEntries.length;
  const filledBatches = Array.from({ length: TOTAL_BATCHES }, (_, i) =>
    Math.max(0, Math.min(BATCH_SIZE, totalFilled - i * BATCH_SIZE))
  );

  function getAvatar(globalIdx: number) {
    if (globalIdx < SEED_COUNT) return { ...buildSeedAvatar(globalIdx), real: false };
    const realIdx = globalIdx - SEED_COUNT;
    if (realIdx < realEntries.length) return { ...buildRealAvatar(realEntries[realIdx]), real: true };
    return null;
  }

  return (
    <div ref={vizRef} className="relative left-1/2 right-1/2 -mx-[50vw] w-screen py-6 sm:py-8 px-3 sm:px-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-3 sm:mb-4 gap-1 max-w-[1200px] mx-auto">
        <span className="text-xs sm:text-sm font-semibold text-[#0a0a0a]">
          Engineers on the waitlist
        </span>
        <span className="text-xs sm:text-sm text-[#999]">
          Spots are filling up.{" "}
          <a href="#waitlist" className="text-[#e87b35] font-medium hover:underline no-underline">
            Get started
          </a>
        </span>
      </div>

      {/* Grid */}
      <div className="overflow-x-auto -mx-1 px-1">
      <div className="grid grid-cols-5 gap-1 rounded-lg overflow-hidden border border-[#e8e0d8] max-w-[1200px] mx-auto min-w-[600px]">
        {Array.from({ length: TOTAL_BATCHES }, (_, batchIdx) => {
          const filled = filledBatches[batchIdx];
          const isFull = filled === BATCH_SIZE;
          const isPartial = filled > 0 && filled < BATCH_SIZE;

          return (
            <div key={batchIdx} className="bg-white p-2">
              <div className={`text-[11px] font-semibold mb-2 text-center ${
                isFull ? "text-[#00a86b]" : isPartial ? "text-[#0066ff]" : "text-[#ccc]"
              }`}>
                Batch {batchIdx + 1}
              </div>
              <div className="grid grid-cols-10 gap-[3px]">
                {Array.from({ length: BATCH_SIZE }, (_, spotIdx) => {
                  const isFilled = spotIdx < filled;
                  if (!isFilled) {
                    return <div key={spotIdx} className="aspect-square rounded bg-[#f0ece8]" />;
                  }

                  const globalIdx = batchIdx * BATCH_SIZE + spotIdx;
                  const avatar = getAvatar(globalIdx);
                  if (!avatar) return <div key={spotIdx} className="aspect-square rounded bg-[#f0ece8]" />;

                  if (avatar.type === "img") {
                    return (
                      <div
                        key={spotIdx}
                        className="aspect-square rounded overflow-hidden"
                        style={{ backgroundColor: "#ddd" }}
                      >
                        <img
                          src={avatar.url}
                          alt=""
                          loading="lazy"
                          className="w-full h-full object-cover block"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = "none";
                          }}
                        />
                      </div>
                    );
                  }

                  return (
                    <div
                      key={spotIdx}
                      className="aspect-square rounded flex items-center justify-center text-white"
                      style={{
                        backgroundColor: avatar.bg,
                        fontSize: "0.46rem",
                        fontWeight: 700,
                      }}
                    >
                      {avatar.text}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      </div>
    </div>
  );
};
