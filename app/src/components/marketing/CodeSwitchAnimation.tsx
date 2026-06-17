import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { Check, Copy, RotateCw } from "lucide-react";
import { trackCtaClick } from "@/utils/analytics";

// ───────────────────────────────────────────────────────────────────────────
// Code-switch animation — a self-contained showcase of how little code changes
// to move an OpenAI / Bedrock / Anthropic call onto Nadir. Instead of a static
// red/green diff, the editor *plays* the edit: it shows the original provider
// call, erases the lines that change, and types the Nadir replacements in their
// place. Reused on /switch, the homepage, and the Product Hunt landing page.
// ───────────────────────────────────────────────────────────────────────────

type LineType = "context" | "add" | "del";
type DiffLine = { type: LineType; text: string };
type Lang = "python" | "node";
type Provider = "openai" | "bedrock" | "anthropic";

export const NADIR_BASE = "https://api.getnadir.com/v1";

// Each entry is a unified diff: del lines are the provider's current code,
// add lines are the Nadir equivalent, context lines are shared. The "after"
// (what Copy yields) is every non-del line.
const DIFFS: Record<Provider, Record<Lang, DiffLine[]>> = {
  openai: {
    python: [
      { type: "context", text: "from openai import OpenAI" },
      { type: "context", text: "" },
      { type: "context", text: "client = OpenAI(" },
      { type: "add", text: `    base_url="${NADIR_BASE}",` },
      { type: "del", text: '    api_key="sk-...",' },
      { type: "add", text: '    api_key="ndr_...",' },
      { type: "context", text: ")" },
      { type: "context", text: "" },
      { type: "context", text: "resp = client.chat.completions.create(" },
      { type: "del", text: '    model="gpt-4o",' },
      { type: "add", text: '    model="auto",  # Nadir picks the cheapest model that fits' },
      { type: "context", text: '    messages=[{"role": "user", "content": "Hello!"}],' },
      { type: "context", text: ")" },
      { type: "context", text: "print(resp.choices[0].message.content)" },
    ],
    node: [
      { type: "context", text: 'import OpenAI from "openai";' },
      { type: "context", text: "" },
      { type: "context", text: "const client = new OpenAI({" },
      { type: "add", text: `  baseURL: "${NADIR_BASE}",` },
      { type: "del", text: '  apiKey: "sk-...",' },
      { type: "add", text: '  apiKey: "ndr_...",' },
      { type: "context", text: "});" },
      { type: "context", text: "" },
      { type: "context", text: "const resp = await client.chat.completions.create({" },
      { type: "del", text: '  model: "gpt-4o",' },
      { type: "add", text: '  model: "auto", // Nadir picks the cheapest model that fits' },
      { type: "context", text: '  messages: [{ role: "user", content: "Hello!" }],' },
      { type: "context", text: "});" },
      { type: "context", text: "console.log(resp.choices[0].message.content);" },
    ],
  },
  bedrock: {
    python: [
      { type: "del", text: "import boto3, json" },
      { type: "add", text: "from openai import OpenAI" },
      { type: "context", text: "" },
      { type: "del", text: 'client = boto3.client("bedrock-runtime", region_name="us-east-1")' },
      { type: "add", text: "client = OpenAI(" },
      { type: "add", text: `    base_url="${NADIR_BASE}",` },
      { type: "add", text: '    api_key="ndr_...",' },
      { type: "add", text: ")" },
      { type: "context", text: "" },
      { type: "del", text: "resp = client.invoke_model(" },
      { type: "del", text: '    modelId="anthropic.claude-3-5-sonnet-20241022-v2:0",' },
      { type: "del", text: "    body=json.dumps({" },
      { type: "del", text: '        "anthropic_version": "bedrock-2023-05-31",' },
      { type: "del", text: '        "max_tokens": 1024,' },
      { type: "del", text: '        "messages": [{"role": "user", "content": "Hello!"}],' },
      { type: "del", text: "    })," },
      { type: "del", text: ")" },
      { type: "del", text: 'text = json.loads(resp["body"].read())["content"][0]["text"]' },
      { type: "add", text: "resp = client.chat.completions.create(" },
      { type: "add", text: '    model="auto",' },
      { type: "add", text: '    messages=[{"role": "user", "content": "Hello!"}],' },
      { type: "add", text: ")" },
      { type: "add", text: "text = resp.choices[0].message.content" },
      { type: "context", text: "print(text)" },
    ],
    node: [
      { type: "del", text: 'import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";' },
      { type: "add", text: 'import OpenAI from "openai";' },
      { type: "context", text: "" },
      { type: "del", text: 'const client = new BedrockRuntimeClient({ region: "us-east-1" });' },
      { type: "add", text: "const client = new OpenAI({" },
      { type: "add", text: `  baseURL: "${NADIR_BASE}",` },
      { type: "add", text: '  apiKey: "ndr_...",' },
      { type: "add", text: "});" },
      { type: "context", text: "" },
      { type: "del", text: "const cmd = new InvokeModelCommand({" },
      { type: "del", text: '  modelId: "anthropic.claude-3-5-sonnet-20241022-v2:0",' },
      { type: "del", text: "  body: JSON.stringify({" },
      { type: "del", text: '    anthropic_version: "bedrock-2023-05-31",' },
      { type: "del", text: "    max_tokens: 1024," },
      { type: "del", text: '    messages: [{ role: "user", content: "Hello!" }],' },
      { type: "del", text: "  })," },
      { type: "del", text: "});" },
      { type: "del", text: "const out = await client.send(cmd);" },
      { type: "del", text: "const text = JSON.parse(new TextDecoder().decode(out.body)).content[0].text;" },
      { type: "add", text: "const resp = await client.chat.completions.create({" },
      { type: "add", text: '  model: "auto",' },
      { type: "add", text: '  messages: [{ role: "user", content: "Hello!" }],' },
      { type: "add", text: "});" },
      { type: "add", text: "const text = resp.choices[0].message.content;" },
      { type: "context", text: "console.log(text);" },
    ],
  },
  anthropic: {
    python: [
      { type: "del", text: "from anthropic import Anthropic" },
      { type: "add", text: "from openai import OpenAI" },
      { type: "context", text: "" },
      { type: "del", text: 'client = Anthropic(api_key="sk-ant-...")' },
      { type: "add", text: "client = OpenAI(" },
      { type: "add", text: `    base_url="${NADIR_BASE}",` },
      { type: "add", text: '    api_key="ndr_...",' },
      { type: "add", text: ")" },
      { type: "context", text: "" },
      { type: "del", text: "resp = client.messages.create(" },
      { type: "del", text: '    model="claude-sonnet-4-6",' },
      { type: "del", text: "    max_tokens=1024," },
      { type: "add", text: "resp = client.chat.completions.create(" },
      { type: "add", text: '    model="auto",' },
      { type: "context", text: '    messages=[{"role": "user", "content": "Hello!"}],' },
      { type: "context", text: ")" },
      { type: "del", text: "print(resp.content[0].text)" },
      { type: "add", text: "print(resp.choices[0].message.content)" },
    ],
    node: [
      { type: "del", text: 'import Anthropic from "@anthropic-ai/sdk";' },
      { type: "add", text: 'import OpenAI from "openai";' },
      { type: "context", text: "" },
      { type: "del", text: 'const client = new Anthropic({ apiKey: "sk-ant-..." });' },
      { type: "add", text: "const client = new OpenAI({" },
      { type: "add", text: `  baseURL: "${NADIR_BASE}",` },
      { type: "add", text: '  apiKey: "ndr_...",' },
      { type: "add", text: "});" },
      { type: "context", text: "" },
      { type: "del", text: "const resp = await client.messages.create({" },
      { type: "del", text: '  model: "claude-sonnet-4-6",' },
      { type: "del", text: "  max_tokens: 1024," },
      { type: "add", text: "const resp = await client.chat.completions.create({" },
      { type: "add", text: '  model: "auto",' },
      { type: "context", text: '  messages: [{ role: "user", content: "Hello!" }],' },
      { type: "context", text: "});" },
      { type: "del", text: "console.log(resp.content[0].text);" },
      { type: "add", text: "console.log(resp.choices[0].message.content);" },
    ],
  },
};

const PROVIDERS: { id: Provider; label: string; mark: string }[] = [
  { id: "openai", label: "OpenAI", mark: "OA" },
  { id: "bedrock", label: "AWS Bedrock", mark: "AWS" },
  { id: "anthropic", label: "Anthropic", mark: "AN" },
];

const LANGS: { id: Lang; label: string }[] = [
  { id: "python", label: "Python" },
  { id: "node", label: "Node.js" },
];

// Per-provider, the human takeaway under the diff.
const TAKEAWAY: Record<Provider, string> = {
  openai: "Add one line, swap the key, set model=\"auto\". Your call shape, SDK, and tooling are untouched.",
  bedrock: "Drop the SigV4 client and the invoke_model JSON envelope. The same prompt routes through a clean OpenAI-style call.",
  anthropic: "The OpenAI-compatible endpoint means one client for every model. Nadir routes across Haiku, Sonnet, and Opus for you.",
};

// ── Minimal, safe per-line tokenizer: strings + trailing comments only. ──────
// Strings are consumed greedily to a matching quote, so a "//" inside a URL
// string is never mistaken for a comment.
type Tok = { kind: "code" | "str" | "comment"; value: string };

const tokenizeLine = (text: string, lang: Lang): Tok[] => {
  const commentMark = lang === "python" ? "#" : "//";
  const toks: Tok[] = [];
  let buf = "";
  const flush = () => {
    if (buf) {
      toks.push({ kind: "code", value: buf });
      buf = "";
    }
  };
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '"' || ch === "'") {
      flush();
      let str = ch;
      i += 1;
      while (i < text.length && text[i] !== ch) {
        str += text[i];
        i += 1;
      }
      if (i < text.length) {
        str += text[i];
        i += 1;
      }
      toks.push({ kind: "str", value: str });
      continue;
    }
    if (text.startsWith(commentMark, i)) {
      flush();
      toks.push({ kind: "comment", value: text.slice(i) });
      break;
    }
    buf += ch;
    i += 1;
  }
  flush();
  return toks;
};

const TOK_COLOR: Record<Tok["kind"], string> = {
  code: "#e6edf3",
  str: "#a5d6ff",
  comment: "#8b949e",
};

// ── Transformation animation ────────────────────────────────────────────────
type Op =
  | { kind: "keep"; to: string }
  | { kind: "add"; to: string }
  | { kind: "replace"; from: string; to: string }
  | { kind: "remove"; from: string };

// Turn a unified diff into an ordered edit script. Within each hunk, deletions
// and additions are zipped into "replace" ops (a line erases then retypes);
// any leftover deletions become "remove", leftover additions become "add".
const buildOps = (diff: DiffLine[]): Op[] => {
  const ops: Op[] = [];
  let i = 0;
  while (i < diff.length) {
    if (diff[i].type === "context") {
      ops.push({ kind: "keep", to: diff[i].text });
      i += 1;
      continue;
    }
    const dels: string[] = [];
    while (i < diff.length && diff[i].type === "del") dels.push(diff[i++].text);
    const adds: string[] = [];
    while (i < diff.length && diff[i].type === "add") adds.push(diff[i++].text);
    const n = Math.max(dels.length, adds.length);
    for (let k = 0; k < n; k++) {
      const from = dels[k];
      const to = adds[k];
      if (from != null && to != null) ops.push({ kind: "replace", from, to });
      else if (from != null) ops.push({ kind: "remove", from });
      else ops.push({ kind: "add", to });
    }
  }
  return ops;
};

type AnimRow = {
  id: number;
  kind: Op["kind"];
  from: string;
  to: string;
  text: string;
  visible: boolean;
  removed: boolean;
};

const CodeLine = ({
  text,
  lang,
  active,
}: {
  text: string;
  lang: Lang;
  active: boolean;
}) => {
  const toks = tokenizeLine(text, lang);
  return (
    <div className="flex items-stretch min-h-[1.65em]">
      <span className="whitespace-pre pl-4 pr-4">
        {toks.map((t, idx) => (
          <span key={idx} style={{ color: TOK_COLOR[t.kind] }}>
            {t.value}
          </span>
        ))}
        {active && (
          <span className="ml-px inline-block h-[1.05em] w-[2px] -mb-[0.18em] animate-pulse bg-[#6ee7b7] align-baseline" />
        )}
      </span>
    </div>
  );
};

// Human-paced typing. Deliberate cadence with natural variation: a little
// jitter per keystroke, slightly longer pauses at spaces/punctuation, and the
// occasional "thinking" pause — so it reads like someone writing, not a
// machine spitting characters. Tweak these to taste.
const TYPE_MS = 58; // base delay per typed character
const TYPE_JITTER_MS = 80; // random extra (0..this) per character
const ERASE_MS = 20; // base delay per backspaced character
const ERASE_JITTER_MS = 18;
const THINK_PAUSE_MS = 260; // occasional mid-line pause while "thinking"
const PAUSE_AFTER_TYPE = 320; // settle after finishing a line
const PAUSE_AFTER_ERASE = 150; // beat before typing the replacement
const PAUSE_BEFORE_NEXT = 170; // beat after removing a line
const INTRO_PAUSE = 900; // hold the original call before editing starts

interface CodeSwitchAnimationProps {
  /** Render the "+N −M lines · takeaway" row below the editor. */
  showTakeaway?: boolean;
  /** Suffix for the copy-button analytics event location. */
  analyticsLocation?: string;
}

export const CodeSwitchAnimation = ({
  showTakeaway = true,
  analyticsLocation = "switch",
}: CodeSwitchAnimationProps) => {
  const [provider, setProvider] = useState<Provider>("openai");
  const [lang, setLang] = useState<Lang>("python");
  const [copied, setCopied] = useState(false);
  const [replayKey, setReplayKey] = useState(0);
  const [, forceTick] = useReducer((x: number) => x + 1, 0);

  const lines = DIFFS[provider][lang];
  const afterCode = useMemo(
    () =>
      lines
        .filter((l) => l.type !== "del")
        .map((l) => l.text)
        .join("\n"),
    [lines],
  );
  const added = lines.filter((l) => l.type === "add").length;
  const removed = lines.filter((l) => l.type === "del").length;

  // Mutable animation model lives in refs; forceTick re-renders from it.
  const stateRef = useRef<{ rows: AnimRow[]; activeId: number | null; done: boolean }>({
    rows: [],
    activeId: null,
    done: false,
  });
  useEffect(() => {
    // Per-run local guards (robust under StrictMode's mount/unmount/mount):
    // each effect run owns its own `cancelled` flag and timer handle.
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = (fn: () => void, ms: number) => {
      timer = setTimeout(() => {
        if (!cancelled) fn();
      }, ms);
    };

    const ops = buildOps(lines);
    let idc = 0;
    const rows: AnimRow[] = ops.map((op) => ({
      id: idc++,
      kind: op.kind,
      from: "from" in op ? op.from : "",
      to: "to" in op ? op.to : "",
      // BEFORE state: context + the lines being replaced/removed show their
      // original text; brand-new (add) lines stay hidden until typed.
      text: op.kind === "keep" ? op.to : op.kind === "add" ? "" : (op as { from: string }).from,
      visible: op.kind !== "add",
      removed: false,
    }));
    stateRef.current = { rows, activeId: null, done: false };
    forceTick();

    const reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      rows.forEach((r) => {
        if (r.kind === "remove") r.removed = true;
        else {
          r.text = r.to;
          r.visible = true;
        }
      });
      stateRef.current.done = true;
      forceTick();
      return () => {
        cancelled = true;
      };
    }

    const eraseThen = (row: AnimRow, done: () => void) => {
      const step = () => {
        if (row.text.length === 0) return schedule(done, PAUSE_AFTER_ERASE);
        // Backspace one character at a time, the way you actually delete.
        row.text = row.text.slice(0, row.text.length - 1);
        forceTick();
        schedule(step, ERASE_MS + Math.random() * ERASE_JITTER_MS);
      };
      step();
    };

    const typeThen = (row: AnimRow, done: () => void) => {
      const target = row.to;
      const step = () => {
        if (row.text.length >= target.length) {
          row.text = target;
          forceTick();
          return schedule(done, PAUSE_AFTER_TYPE);
        }
        const i = row.text.length;
        row.text = target.slice(0, i + 1);
        forceTick();
        // Vary the rhythm so it feels typed, not generated.
        const ch = target[i];
        let delay = TYPE_MS + Math.random() * TYPE_JITTER_MS;
        if (ch === " ") delay += 45; // small breath at word gaps
        else if (",.(){}=:\"'".includes(ch)) delay += 55; // and around punctuation
        if (Math.random() < 0.05) delay += THINK_PAUSE_MS; // occasional pause
        schedule(step, delay);
      };
      step();
    };

    const animate = (opIdx: number) => {
      if (opIdx >= rows.length) {
        stateRef.current.activeId = null;
        stateRef.current.done = true;
        forceTick();
        return;
      }
      const row = rows[opIdx];
      if (row.kind === "keep") return animate(opIdx + 1);
      stateRef.current.activeId = row.id;
      forceTick();
      if (row.kind === "add") {
        row.visible = true;
        typeThen(row, () => animate(opIdx + 1));
      } else if (row.kind === "replace") {
        eraseThen(row, () => typeThen(row, () => animate(opIdx + 1)));
      } else {
        eraseThen(row, () => {
          row.removed = true;
          forceTick();
          schedule(() => animate(opIdx + 1), PAUSE_BEFORE_NEXT);
        });
      }
    };

    // Let the reader register the original call, then play the edit.
    schedule(() => animate(0), INTRO_PAUSE);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [lines, replayKey]);

  const copy = () => {
    navigator.clipboard.writeText(afterCode);
    setCopied(true);
    trackCtaClick("copy_nadir_snippet", `${analyticsLocation}_${provider}_${lang}`);
    setTimeout(() => setCopied(false), 2000);
  };

  const fileName = lang === "python" ? "app.py" : "app.ts";
  const providerLabel = PROVIDERS.find((p) => p.id === provider)?.label ?? "your";
  const { rows, activeId, done } = stateRef.current;

  return (
    <div className="max-w-[860px] mx-auto w-full">
      {/* Provider segmented control */}
      <div className="flex flex-col items-center gap-3">
        <span className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[#86868b]">
          You're calling
        </span>
        <div className="inline-flex flex-wrap justify-center gap-1 p-1 rounded-full bg-[#f0f0f2] border border-black/[0.06]">
          {PROVIDERS.map((p) => {
            const active = provider === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setProvider(p.id)}
                aria-pressed={active}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-[13.5px] font-medium transition-colors ${
                  active
                    ? "bg-white text-[#1d1d1f] shadow-[0_1px_3px_rgba(0,0,0,0.12)]"
                    : "text-[#6e6e73] hover:text-[#1d1d1f]"
                }`}
              >
                <span
                  aria-hidden
                  className={`inline-flex items-center justify-center h-5 min-w-[24px] px-1 rounded-[6px] text-[9.5px] font-bold tracking-tight ${
                    active ? "bg-[#1d1d1f] text-white" : "bg-black/[0.06] text-[#86868b]"
                  }`}
                >
                  {p.mark}
                </span>
                {p.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Editor panel */}
      <div
        className="mt-7 rounded-[16px] overflow-hidden border border-black/[0.08] bg-[#0d1117]"
        style={{ boxShadow: "0 40px 80px -28px rgba(0,0,0,0.45), 0 2px 6px rgba(0,0,0,0.06)" }}
      >
        {/* Title bar */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.08]">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex gap-1.5 shrink-0">
              <span className="w-3 h-3 rounded-full bg-[#ff5f57]" />
              <span className="w-3 h-3 rounded-full bg-[#febc2e]" />
              <span className="w-3 h-3 rounded-full bg-[#28c840]" />
            </div>
            <span className="text-[12.5px] text-[#8b949e] font-mono truncate">{fileName}</span>
            <span
              className={`hidden sm:inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] transition-colors ${
                done ? "bg-[#34d399]/15 text-[#6ee7b7]" : "bg-white/[0.06] text-[#8b949e]"
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${done ? "bg-[#34d399]" : "bg-[#8b949e]"}`} />
              {done ? "on Nadir" : `${providerLabel} call`}
            </span>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {/* Replay */}
            <button
              type="button"
              onClick={() => setReplayKey((k) => k + 1)}
              aria-label="Replay the change"
              className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[#8b949e] hover:text-white transition-colors"
            >
              <RotateCw className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Replay</span>
            </button>
            {/* Language toggle */}
            <div className="inline-flex rounded-lg bg-white/[0.06] p-0.5">
              {LANGS.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => setLang(l.id)}
                  aria-pressed={lang === l.id}
                  className={`px-2.5 py-1 rounded-md text-[12px] font-medium transition-colors ${
                    lang === l.id
                      ? "bg-white/[0.12] text-white"
                      : "text-[#8b949e] hover:text-white"
                  }`}
                >
                  {l.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={copy}
              className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[#8b949e] hover:text-white transition-colors"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-[#3fb950]" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copied" : "Copy Nadir version"}
            </button>
          </div>
        </div>

        {/* Animated edit: the original call transforms into the Nadir call */}
        <div className="overflow-x-auto py-3 text-[13px] leading-[1.65] font-mono">
          {rows.map((row) =>
            row.removed || !row.visible ? null : (
              <CodeLine key={row.id} text={row.text} lang={lang} active={activeId === row.id} />
            ),
          )}
        </div>
      </div>

      {/* Stat + takeaway */}
      {showTakeaway && (
        <div className="mt-4 flex flex-col sm:flex-row sm:items-center gap-x-4 gap-y-2 justify-center text-center sm:text-left">
          <span className="inline-flex items-center gap-2 shrink-0 justify-center">
            <span className="text-[13px] font-semibold font-mono text-[#028a3e]">+{added}</span>
            <span className="text-[13px] font-semibold font-mono text-[#d1242f]">−{removed}</span>
            <span className="text-[12px] text-[#86868b] uppercase tracking-[0.08em] font-semibold">
              lines
            </span>
          </span>
          <span className="hidden sm:block w-px h-4 bg-black/[0.12]" />
          <p className="text-[13.5px] text-[#424245] leading-[1.5] max-w-[560px]">
            {TAKEAWAY[provider]}
          </p>
        </div>
      )}
    </div>
  );
};

export default CodeSwitchAnimation;
