// Renders WingStats into an animated SVG.
//
// Mapping:
//   name      → genome: primaries, coverts, trail, bone, echo pairs, quirk name, accent, sigil, motes, pose (see genome.ts)
//   activity  → feather count and number of feather layers / veins (profile contributions, else commits)
//   stars     → wingspan, tier metal (bone, halo, badges), glow and sparkles
//   languages → wing colors (sectors from tip to body) + heart donut + badges
//   tech      → visual traits (aurora, runes, neural, pixel, ember, prism, hex, constellation, crystal) + badges
//   primary language family → feather shape (blade / flowing), otherwise the genome's feather style

import type { LanguageStat, TechStat, WingStats } from "./github.js";
import { genomeFor, seededRandom, type FeatherStyle, type Genome } from "./genome.js";
import { getIcon } from "./icons.js";
import { SHAPE_BY_LANGUAGE, TRAIT_BY_LANGUAGE, type FeatherShape, type Trait } from "./tech.js";

export interface RenderOptions {
  /** CSS animations (flap, sparkles, particles). Default true. */
  animate?: boolean;
  /** Text colors: "auto" follows prefers-color-scheme. Default "auto". */
  theme?: "auto" | "dark" | "light";
  /** Draw a rounded card background. Default false (transparent). */
  background?: boolean;
  /** Title + stats + legend under the wings. Default true. */
  label?: boolean;
  /** Override the title text. */
  title?: string;
  /** Grow the wings from this name instead of the subject (another quirk). */
  seed?: string;
  /** A small "grown with Quaximur/GitWings" link under the label. Default true. */
  credit?: boolean;
  /** Languages and technologies under the stats line. Default true; the README snippet lists them as links instead. */
  legend?: boolean;
}

export interface Tier {
  name: string;
  metal: string;
  metalLight: string;
}

const TIERS: [minStars: number, tier: Tier][] = [
  [50_000, { name: "Seraphic", metal: "#5ee7ff", metalLight: "#e0fbff" }],
  [10_000, { name: "Mythic", metal: "#b388ff", metalLight: "#efe4ff" }],
  [1_000, { name: "Celestial", metal: "#f5c542", metalLight: "#fff3c4" }],
  [100, { name: "Soaring", metal: "#c0c8d4", metalLight: "#f4f7fb" }],
  [10, { name: "Rising", metal: "#cd8a4a", metalLight: "#f3d2ae" }],
  [0, { name: "Fledgling", metal: "#9aa4b2", metalLight: "#dde3ea" }],
];

export function tierFor(stars: number): Tier {
  return TIERS.find(([min]) => stars >= min)![1];
}

// ─── Small utilities ─────────────────────────────────────────────────

type Pt = { x: number; y: number };

const f = (n: number) => (Math.round(n * 10) / 10).toString();
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const pt = (p: Pt) => `${f(p.x)} ${f(p.y)}`;
const deg = (a: number) => (a * Math.PI) / 180;
const rot = (p: Pt, a: number): Pt => ({ x: p.x * Math.cos(deg(a)) - p.y * Math.sin(deg(a)), y: p.x * Math.sin(deg(a)) + p.y * Math.cos(deg(a)) });
const add = (a: Pt, b: Pt): Pt => ({ x: a.x + b.x, y: a.y + b.y });
const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y });
const scale = (a: Pt, k: number): Pt => ({ x: a.x * k, y: a.y * k });
const mid = (a: Pt, b: Pt, t = 0.5): Pt => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) });
const quadAt = (a: Pt, c: Pt, b: Pt, t: number): Pt => mid(mid(a, c, t), mid(c, b, t), t);
const cubicAt = (a: Pt, c1: Pt, c2: Pt, b: Pt, t: number): Pt => mid(quadAt(a, c1, c2, t), quadAt(c1, c2, b, t), t);
/** SVG transform that scales by k around p. */
const scaleAround = (p: Pt, k: number) => `translate(${pt(p)}) scale(${Math.round(k * 1000) / 1000}) translate(${f(-p.x)} ${f(-p.y)})`;

function parseColor(c: string): [number, number, number] {
  if (c.startsWith("#")) {
    const h = c.length === 4 ? c.slice(1).split("").map((x) => x + x).join("") : c.slice(1);
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
  }
  const m = c.match(/hsl\((\d+)\s+(\d+)%\s+(\d+)%\)/);
  if (m) {
    const [h, s, l] = [Number(m[1]), Number(m[2]) / 100, Number(m[3]) / 100];
    const k = (n: number) => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const ch = (n: number) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))));
    return [ch(0), ch(8), ch(4)];
  }
  return [139, 148, 158];
}

function mix(c: string, target: string, amount: number): string {
  const a = parseColor(c);
  const b = parseColor(target);
  return "#" + a.map((v, i) => Math.round(lerp(v, b[i], amount)).toString(16).padStart(2, "0")).join("");
}
const tint = (c: string, k: number) => mix(c, "#ffffff", k);
const shade = (c: string, k: number) => mix(c, "#000000", k);

function luminance(c: string): number {
  const [r, g, b] = parseColor(c).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** What drives the feathers and the label: all-time contributions for profiles when known, otherwise commits. */
export function activityOf(stats: WingStats): { count: number; noun: string } {
  return stats.contributions !== undefined
    ? { count: stats.contributions, noun: "contributions" }
    : { count: stats.commits, noun: "commits" };
}

export function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}k`;
  return String(n);
}

// ─── Wing geometry ────────────────────────────────────────────────────

/** The skeleton of a wing: a leading edge, and the direction and depth of the wing behind each point of it. */
interface Geometry {
  bone: (t: number) => Pt;
  angle: (t: number) => number; // degrees, SVG orientation
  length: (t: number) => number;
}

function makeGeometry(span: number, gen: Genome): Geometry {
  const p0 = { x: 0, y: 0 };
  const p1 = { x: span * 0.24, y: -span * (0.6 + 0.1 * gen.lift) };
  const p2 = { x: span * (0.6 + 0.08 * gen.sweep), y: -span * (0.5 + 0.1 * gen.lift) };
  const fan = 72 + 18 * gen.fan;
  return {
    bone: (t) => quadAt(p0, p1, p2, t),
    angle: (t) => 102 - fan * t ** 1.1,
    length: (t) => span * (0.4 + 0.17 * Math.sin(t * Math.PI * 0.55)),
  };
}

function along(g: Geometry, t: number, lenFactor: number, k: number): Pt {
  const b = g.bone(t);
  const a = deg(g.angle(t));
  const l = g.length(t) * lenFactor * k;
  return { x: b.x + Math.cos(a) * l, y: b.y + Math.sin(a) * l };
}

type Feather = FeatherShape | FeatherStyle;

function featherPath(shape: Feather | "scale", L: number, w: number): string {
  const p = (x: number, y: number) => `${f(L * x)} ${f(w * y)}`;
  switch (shape) {
    case "blade":
      return `M0 0L${p(0.22, -0.95)}L${p(1, -0.12)}L${p(0.9, 0.38)}L${p(0.18, 0.75)}Z`;
    case "flowing":
      return `M0 0C${p(0.4, -1.15)} ${p(0.78, -0.25)} ${p(1.06, -0.45)}C${p(0.72, 0.45)} ${p(0.35, 0.95)} 0 0Z`;
    case "scale":
      return `M0 0C${p(0.15, -1.1)} ${p(1.05, -1)} ${p(1, 0)}C${p(1.05, 1)} ${p(0.15, 1.1)} 0 0Z`;
    case "plume":
      return `M0 0C${p(0.18, -1.3)} ${p(0.72, -1.35)} ${p(1.02, -0.2)}C${p(1.05, 0.3)} ${p(0.7, 1)} ${p(0.22, 0.85)}Q${p(0.06, 0.4)} 0 0Z`;
    case "sickle":
      return `M0 0C${p(0.3, -1.2)} ${p(0.78, -1.3)} ${p(1.08, -1.6)}C${p(0.86, -0.45)} ${p(0.42, 0.85)} 0 0Z`;
    case "flame":
      return (
        `M0 0C${p(0.18, -1.1)} ${p(0.38, -0.3)} ${p(0.55, -0.95)}C${p(0.68, -1.45)} ${p(0.86, -0.55)} ${p(1.1, -0.8)}` +
        `C${p(0.9, 0.15)} ${p(0.66, 0.8)} ${p(0.42, 0.45)}C${p(0.28, 0.25)} ${p(0.14, 0.85)} 0 0Z`
      );
    default:
      return `M0 0C${p(0.28, -1.05)} ${p(0.8, -0.95)} ${p(1, 0)}C${p(0.82, 0.72)} ${p(0.3, 0.85)} 0 0Z`;
  }
}

/** A peacock eye: dark ring, accent iris, a pupil of the feather's color and a glint. */
function ocellus(x: number, y: number, r: number, color: string, accent: string): string {
  return (
    `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="${shade(color, 0.7)}" opacity=".85"/>` +
    `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r * 0.72)}" fill="${accent}"/>` +
    `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r * 0.42)}" fill="${shade(color, 0.35)}"/>` +
    `<circle cx="${f(x - r * 0.15)}" cy="${f(y - r * 0.15)}" r="${f(r * 0.14)}" fill="#ffffff" opacity=".85"/>`
  );
}

function boneStroke(points: Pt[], tier: Tier, width: number): string {
  const d = "M" + points.map(pt).join("L");
  return (
    `<path d="${d}" stroke="${shade(tier.metal, 0.5)}" stroke-width="${f(width * 1.5)}" stroke-linecap="round" stroke-linejoin="round" fill="none"/>` +
    `<path d="${d}" stroke="url(#metal)" stroke-width="${f(width)}" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`
  );
}

// ─── Wing assembly ────────────────────────────────────────────────────

interface Ctx {
  span: number;
  g: Geometry;
  langs: LanguageStat[];
  /** Language index at u: 0 = wing tip, 1 = body. */
  langAt: (u: number) => number;
  layerCount: number;
  n0: number;
  feather: Feather;
  tier: Tier;
  starPower: number;
  gen: Genome;
  rnd: () => number;
  has: (t: Trait) => boolean;
  defs: string[];
}

interface WingArt {
  body: string[];
  /** Outline points in wing coordinates, for sizing the canvas. */
  hull: Pt[];
}

const LAYER_TINTS = [-0.22, 0, 0.18, 0.36];
const layerColor = (c: string, layer: number) => {
  const k = LAYER_TINTS[layer];
  return k < 0 ? shade(c, -k) : tint(c, k);
};

/** Feather layers from the tip outwards: primaries, secondaries, coverts, down. */
const LAYERS = [
  { len: 1.0, width: 0.15, from: 0, to: 1, extra: 0 },
  { len: 0.66, width: 0.17, from: 0.02, to: 0.93, extra: -1 },
  { len: 0.42, width: 0.2, from: 0.03, to: 0.86, extra: -2 },
  { len: 0.22, width: 0.32, from: 0.04, to: 0.8, extra: 4 },
];

/** Assembles the wing from its genes, back to front: veil, trail, primaries, coverts, bone. */
function composeWing(c: Ctx): WingArt {
  const { g, gen } = c;
  const body: string[] = [];
  const hull: Pt[] = [];
  const bonePts = Array.from({ length: 24 }, (_, i) => g.bone(i / 23));
  hull.push(...bonePts);

  if (gen.primaries === "ribbons" || gen.trail === "ribbons") {
    // Veil: a blurred ghost of the whole wing.
    const veil = [...bonePts, ...Array.from({ length: 12 }, (_, i) => along(g, 1 - i / 11, 1.05, 1))];
    body.push(`<path d="M${veil.map(pt).join("L")}Z" fill="${gen.accent}" opacity=".16" filter="url(#glow)"/>`);
  }
  if (gen.trail === "ribbons") body.push(ribbons(c, [{ len: 1.55, width: 0.055, count: Math.max(4, Math.round(c.n0 / 2)), from: 0.3, to: 1 }], hull));
  if (gen.trail === "streamers") body.push(streamers(c, hull));

  let over = "";
  switch (gen.primaries) {
    case "membrane": {
      const m = membrane(c, hull);
      body.push(m.under);
      over = m.over;
      break;
    }
    case "ribbons":
      body.push(ribbons(c, RIBBON_ROWS.slice(0, gen.coverts === "none" ? clamp(c.layerCount, 1, 3) : 1), hull));
      break;
    default:
      body.push(featherLayer(c, 0, gen.primaries, hull, 1));
  }
  if (gen.coverts !== "none") {
    // Over a membrane the coverts only clad the arm.
    for (let layer = 1; layer < c.layerCount; layer++) body.push(featherLayer(c, layer, gen.coverts, hull, gen.primaries === "membrane" ? 0.6 : 1));
  }

  body.push(boneOf(c, bonePts), over);
  if (gen.primaries === "shards" || gen.coverts === "shards") body.push(splinters(c, hull));
  return { body, hull };
}

function featherLayer(c: Ctx, layer: number, kind: "feathers" | "shards" | "scales", hull: Pt[], lenScale: number): string {
  const { g, langs, rnd } = c;
  const spec = LAYERS[layer];
  const scales = kind === "scales" || (kind === "feathers" && layer === 3);
  const count = c.n0 + spec.extra + (scales && layer < 3 ? 3 : 0);
  const shape: Feather | "scale" = scales ? "scale" : layer === 2 && c.feather !== "blade" ? "soft" : c.feather;
  const items: string[] = [];
  for (let i = 0; i < count; i++) {
    const t = lerp(spec.to, spec.from, count === 1 ? 0 : i / (count - 1)); // tip first
    const b = g.bone(t);
    const a = g.angle(t) + (rnd() - 0.5) * 4 + layer * 2;
    const L = g.length(t) * spec.len * lenScale * (scales && layer < 3 ? 0.62 : 1) * (0.96 + rnd() * 0.08);
    const w = L * (scales ? 0.34 : kind === "shards" ? spec.width * 0.88 : spec.width);
    const li = c.langAt(1 - t);
    const item = kind === "shards" ? shardFeather(c, L, w, langs[li].color, layer) : softFeather(c, shape, L, w, li, layer);
    items.push(`<g transform="translate(${pt(b)}) rotate(${f(a)})">${item}</g>`);
    hull.push(add(b, rot({ x: L * 1.08, y: 0 }, a)), add(b, rot({ x: L * 0.6, y: -w * 1.2 }, a)), add(b, rot({ x: L * 0.6, y: w }, a)));
  }
  return `<g class="layer">${items.join("")}</g>`;
}

function softFeather(c: Ctx, shape: Feather | "scale", L: number, w: number, li: number, layer: number): string {
  const { gen, rnd } = c;
  const color = c.langs[li].color;
  const fill = gen.marking === "bands" && layer < 2 && shape !== "scale" ? `url(#b${li}_${layer})` : `url(#g${li}_${layer})`;
  const stroke =
    c.has("prism") && layer === 0
      ? ` stroke="url(#prism)" stroke-width="1.6"`
      : gen.marking === "veil" && layer === 0
        ? ` stroke="${gen.accent}" stroke-width="1.2"`
        : ` stroke="${shade(color, 0.6)}" stroke-width=".6"`;
  let out = `<path d="${featherPath(shape, L, w)}" fill="${fill}"${stroke} stroke-opacity=".8"/>`;
  if (layer < 2 && shape !== "blade" && shape !== "scale") {
    out += `<path d="M2 0Q${f(L * 0.5)} ${f(-w * 0.12)} ${f(L * 0.93)} ${f(-w * 0.05)}" stroke="${tint(color, 0.7)}" stroke-width="1" fill="none" opacity=".55"/>`;
    let barbs = "";
    for (let k = 1; k <= 3; k++) {
      const x = L * (0.3 + k * 0.15);
      barbs += `M${f(x)} ${f(-w * 0.05)}L${f(x + L * 0.07)} ${f(-w * 0.6)}M${f(x)} 0L${f(x + L * 0.06)} ${f(w * 0.5)}`;
    }
    out += `<path d="${barbs}" stroke="${shade(color, 0.5)}" stroke-width=".7" opacity=".35"/>`;
  }
  if (shape === "scale" && layer < 3) out += `<path d="M${f(L * 0.2)} 0Q${f(L * 0.6)} ${f(-w * 0.3)} ${f(L * 0.9)} 0" stroke="${tint(color, 0.6)}" stroke-width=".8" fill="none" opacity=".5"/>`;
  if (gen.marking === "eyes" && layer === 0 && L > 40) out += ocellus(L * 0.8, -w * 0.08, w * 0.5, color, gen.accent);
  if (gen.marking === "speckle" && layer < 2) {
    for (let k = 0; k < 3; k++) {
      out += `<circle cx="${f(L * (0.35 + rnd() * 0.5))}" cy="${f(w * (rnd() - 0.6) * 0.6)}" r="${f(0.8 + rnd() * 1.2)}" fill="${tint(gen.accent, 0.3)}" opacity=".7"/>`;
    }
  }
  return out;
}

function shardFeather(c: Ctx, L: number, w: number, color: string, layer: number): string {
  const { gen, rnd } = c;
  const base = layerColor(color, layer);
  const top = { x: L * (0.28 + rnd() * 0.1), y: -w * 1.05 };
  const tip = { x: L * 1.04, y: -w * 0.08 };
  const bot = { x: L * (0.36 + rnd() * 0.1), y: w * 0.85 };
  const edge = c.has("prism") && layer === 0 ? "url(#prism)" : gen.marking === "veil" ? gen.accent : tint(base, 0.6);
  let out =
    `<path d="M0 0L${pt(top)}L${pt(tip)}Z" fill="${tint(base, 0.28)}" fill-opacity=".92"/>` +
    `<path d="M0 0L${pt(tip)}L${pt(bot)}Z" fill="${shade(base, 0.32)}" fill-opacity=".92"/>` +
    `<path d="M0 0L${pt(top)}L${pt(tip)}L${pt(bot)}Z" fill="none" stroke="${edge}" stroke-width="${layer === 0 ? 1 : 0.6}" stroke-opacity=".85" stroke-linejoin="round"/>` +
    `<path d="M0 0L${pt(tip)}" stroke="#ffffff" stroke-width=".7" opacity=".5"/>`;
  if (gen.marking === "bands" && layer < 2) {
    out += `<path d="M${pt(mid(top, tip, 0.55))}L${f(L * 0.7)} ${f(-w * 0.05)}L${pt(mid(bot, tip, 0.55))}" stroke="${shade(base, 0.6)}" stroke-width="1" fill="none" opacity=".6"/>`;
  }
  if ((gen.marking === "eyes" || gen.marking === "speckle") && layer === 0 && rnd() < 0.6) {
    const p = { x: L * (0.55 + rnd() * 0.3), y: -w * 0.3 };
    out += `<path class="tw" d="M${f(p.x)} ${f(p.y - 3)}L${f(p.x + 1.2)} ${f(p.y)}L${f(p.x)} ${f(p.y + 3)}L${f(p.x - 1.2)} ${f(p.y)}Z" fill="${tint(gen.accent, 0.5)}" style="animation-delay:${f(rnd() * 2.8)}s"/>`;
  }
  return out;
}

/** Crystal splinters drifting off the wing tip. */
function splinters(c: Ctx, hull: Pt[]): string {
  const { g, rnd } = c;
  let out = "";
  for (let i = 0; i < 3 + Math.floor(rnd() * 3); i++) {
    const p = along(g, 0.8 + rnd() * 0.2, 1.12 + rnd() * 0.25, 1);
    const h = 5 + rnd() * 6;
    out +=
      `<path class="float" d="M${f(p.x)} ${f(p.y - h)}L${f(p.x + h * 0.4)} ${f(p.y)}L${f(p.x)} ${f(p.y + h)}L${f(p.x - h * 0.4)} ${f(p.y)}Z" ` +
      `fill="${tint(c.langs[0].color, 0.3)}" fill-opacity=".75" stroke="#ffffff" stroke-opacity=".6" stroke-width=".6" style="animation-delay:${f(rnd() * 5)}s"/>`;
    hull.push({ x: p.x, y: p.y - h });
  }
  return out;
}

/** The leading edge: forged metal, a spectral glow, or metal with thorns. */
function boneOf(c: Ctx, pts: Pt[]): string {
  const { gen, tier, starPower, g } = c;
  if (gen.bone === "spectral") {
    const d = "M" + pts.map(pt).join("L");
    return (
      `<path d="${d}" stroke="${gen.accent}" stroke-width="${f(6 + 3 * starPower)}" stroke-linecap="round" fill="none" opacity=".45" filter="url(#soft)"/>` +
      `<path d="${d}" stroke="url(#metal)" stroke-width="${f(2.5 + 2 * starPower)}" stroke-linecap="round" fill="none"/>`
    );
  }
  let out = boneStroke(pts, tier, 4.5 + 3 * starPower);
  if (gen.bone === "thorned") {
    let d = "";
    for (let i = 1; i <= 9; i++) {
      const t = i / 10.5;
      const p = g.bone(t);
      const tan = sub(g.bone(t + 0.02), g.bone(t - 0.02));
      const dir = scale(tan, 1 / Math.hypot(tan.x, tan.y));
      const side = { x: dir.y, y: -dir.x }; // the outer side of the edge
      const h = 6 + 5 * Math.sin(Math.PI * t) + 2 * starPower;
      const tipP = add(add(p, scale(side, h)), scale(dir, h * 0.45));
      d += `M${pt(add(p, scale(dir, -2.6)))}L${pt(tipP)}L${pt(add(p, scale(dir, 2.6)))}Z`;
    }
    out = `<path d="${d}" fill="${tier.metalLight}" stroke="${shade(tier.metal, 0.5)}" stroke-width=".8" stroke-linejoin="round"/>` + out;
  }
  return out;
}

/** A leathery membrane stretched between finger bones, with a scalloped trailing edge. */
function membrane(c: Ctx, hull: Pt[]): { under: string; over: string } {
  const { g, langs, gen, rnd, tier } = c;
  const body: string[] = [];
  const wristT = 0.58;
  const wrist = g.bone(wristT);
  const tip = g.bone(1);
  const k = gen.fingers;
  const fingers = [tip, ...Array.from({ length: k }, (_, j) => along(g, lerp(0.95, 0.2, k === 1 ? 0 : j / (k - 1)), 1.04, 1))];
  const tail = along(g, 0, 0.72, 1);
  const arm = (from: number, to: number) => Array.from({ length: 9 }, (_, i) => g.bone(lerp(from, to, i / 8)));
  const pull = (a: Pt, b: Pt, toward: Pt) => mid(mid(a, b), toward, 0.3);

  const edges: { a: Pt; c: Pt; b: Pt }[] = [];
  for (let j = 0; j < fingers.length; j++) {
    const a = fingers[j];
    const last = j === fingers.length - 1;
    const b = last ? tail : fingers[j + 1];
    const ctrl = pull(a, b, last ? mid(wrist, { x: 0, y: 0 }) : wrist);
    edges.push({ a, c: ctrl, b });
    const d =
      j === 0
        ? `M${arm(wristT, 1).map(pt).join("L")}Q${pt(ctrl)} ${pt(b)}Z`
        : last
          ? `M${pt(wrist)}L${pt(a)}Q${pt(ctrl)} ${pt(b)}L0 0L${arm(0, wristT).map(pt).join("L")}Z`
          : `M${pt(wrist)}L${pt(a)}Q${pt(ctrl)} ${pt(b)}Z`;
    const li = c.langAt(j / fingers.length);
    const color = langs[li].color;
    body.push(
      `<path d="${d}" fill="url(#g${li}_1)" fill-opacity=".9" stroke="${shade(color, 0.55)}" stroke-width=".8" stroke-linejoin="round"/>` +
        `<path d="${d}" transform="${scaleAround(wrist, 0.6)}" fill="${tint(color, 0.35)}" opacity=".28"/>`,
    );
    // Veins fanning out of the wrist: more activity, more veins.
    let veins = "";
    for (let v = 1; v <= c.layerCount; v++) {
      const p = quadAt(a, ctrl, b, v / (c.layerCount + 1));
      veins += `M${pt(wrist)}Q${pt(mid(mid(wrist, p), a, 0.12))} ${pt(p)}`;
    }
    body.push(`<path d="${veins}" stroke="${shade(color, 0.65)}" stroke-width=".7" fill="none" opacity=".45"/>`);
    if (gen.marking === "bands") {
      body.push(`<path d="${d}" transform="${scaleAround(wrist, 0.82)}" fill="none" stroke="${shade(color, 0.6)}" stroke-width="1.2" opacity=".5"/>`);
    }
    if (gen.marking === "speckle" || gen.marking === "eyes") {
      const n = gen.marking === "eyes" ? 1 : 4;
      for (let s = 0; s < n; s++) {
        const p = mid(wrist, quadAt(a, ctrl, b, 0.2 + rnd() * 0.6), 0.25 + rnd() * 0.5);
        body.push(
          gen.marking === "eyes"
            ? `<g class="pulse" style="animation-delay:${f(rnd() * 2.4)}s"><ellipse cx="${f(p.x)}" cy="${f(p.y)}" rx="4.2" ry="1.6" fill="${gen.accent}" filter="url(#soft)"/><ellipse cx="${f(p.x)}" cy="${f(p.y)}" rx="3" ry=".9" fill="${tint(gen.accent, 0.6)}"/></g>`
            : `<circle cx="${f(p.x)}" cy="${f(p.y)}" r="${f(1 + rnd() * 1.4)}" fill="${tint(color, 0.45)}" opacity=".55"/>`,
        );
      }
    }
  }
  const edgeD = edges.map((e) => `M${pt(e.a)}Q${pt(e.c)} ${pt(e.b)}`).join("");
  body.push(`<path d="${edgeD}" stroke="${gen.marking === "veil" ? gen.accent : tint(langs[0].color, 0.55)}" stroke-width="1.1" fill="none" opacity=".7"/>`);

  // Finger bones with spurs at the tips, a claw at the tip of the arm and a thumb claw at the wrist.
  const boneW = 2.6 + 1.6 * c.starPower;
  let spurs = "";
  for (const p of fingers.slice(1)) {
    const dir = scale(sub(p, wrist), 1 / Math.hypot(p.x - wrist.x, p.y - wrist.y));
    const n = { x: -dir.y, y: dir.x };
    body.push(boneStroke([wrist, add(mid(wrist, p), scale(n, -6)), p], tier, boneW));
    spurs += `M${pt(add(p, scale(n, 2.2)))}L${pt(add(p, scale(dir, 10)))}L${pt(add(p, scale(n, -2.2)))}Z`;
  }
  const tan = sub(g.bone(1), g.bone(0.96));
  const tdir = scale(tan, 1 / Math.hypot(tan.x, tan.y));
  const claw = (p: Pt, d: Pt, len: number) => {
    const n = { x: -d.y, y: d.x };
    return `M${pt(add(p, scale(n, 3)))}Q${pt(add(p, scale(d, len * 0.8)))} ${pt(add(add(p, scale(d, len)), scale(n, len * 0.35)))}Q${pt(add(p, scale(d, len * 0.45)))} ${pt(add(p, scale(n, -3)))}Z`;
  };
  spurs += claw(tip, tdir, 14) + claw(wrist, { x: -0.35, y: -0.94 }, 13);

  hull.push(...fingers.map((p) => add(p, scale(sub(p, wrist), 0.06))), tail, ...edges.map((e) => quadAt(e.a, e.c, e.b, 0.5)), add(wrist, { x: -5, y: -14 }));
  return { under: body.join(""), over: `<path d="${spurs}" fill="${tier.metalLight}" stroke="${shade(tier.metal, 0.5)}" stroke-width=".8" stroke-linejoin="round"/>` };
}

const RIBBON_ROWS = [
  { len: 1.3, width: 0.075, count: 0, from: 0, to: 1 },
  { len: 0.85, width: 0.09, count: -3, from: 0.03, to: 0.9 },
  { len: 0.5, width: 0.12, count: -5, from: 0.05, to: 0.8 },
];

/** Long translucent ribbons that sway like smoke. `count` is relative to the feather count when ≤ 0. */
function ribbons(c: Ctx, rows: { len: number; width: number; count: number; from: number; to: number }[], hull: Pt[]): string {
  const { g, gen, rnd } = c;
  const out: string[] = [];
  rows.forEach((row, r) => {
    const n = Math.max(3, row.count > 0 ? row.count : c.n0 + row.count);
    for (let i = 0; i < n; i++) {
      const t = lerp(row.to, row.from, i / (n - 1));
      const b = g.bone(t);
      const a = g.angle(t) + 12 + (rnd() - 0.5) * 6;
      const L = g.length(t) * row.len * (0.9 + rnd() * 0.2);
      const li = c.langAt(1 - t);
      const { d, center } = ribbonPath(L, L * row.width, 0.8 + rnd() * 0.9, rnd() * Math.PI * 2);
      out.push(
        `<g transform="translate(${pt(b)}) rotate(${f(a)})"><g class="sway" style="animation-delay:-${f(rnd() * gen.tempo)}s;animation-duration:${f(gen.tempo * (0.8 + rnd() * 0.5))}s">` +
          `<path d="${d}" fill="url(#p${li}_${r})"/>` +
          `<path d="${center}" stroke="${tint(gen.accent, 0.5)}" stroke-width=".6" fill="none" opacity="${r === 0 ? 0.45 : 0.25}"/></g></g>`,
      );
      hull.push(add(b, rot({ x: L, y: 0 }, a)), add(b, rot({ x: L * 0.5, y: L * 0.08 }, a)));
    }
  });
  return out.reverse().join("");
}

/** A tapering wavy ribbon along +x: its outline and its center line. */
function ribbonPath(L: number, w0: number, waves: number, phase: number): { d: string; center: string } {
  const N = 28;
  const amp = L * 0.05;
  const upper: Pt[] = [];
  const lower: Pt[] = [];
  const center: Pt[] = [];
  for (let i = 0; i <= N; i++) {
    const u = i / N;
    const x = L * u;
    const y = amp * Math.sin(Math.PI * 2 * waves * u + phase) * u;
    const dy = (amp * (Math.PI * 2 * waves * Math.cos(Math.PI * 2 * waves * u + phase) * u + Math.sin(Math.PI * 2 * waves * u + phase))) / L;
    const n = Math.hypot(dy, 1);
    const wd = w0 * Math.sin(Math.PI * (0.15 + 0.85 * u)) ** 0.7;
    upper.push({ x: x + (dy / n) * wd, y: y - wd / n });
    lower.push({ x: x - (dy / n) * wd, y: y + wd / n });
    center.push({ x, y });
  }
  return {
    d: `M${upper.map(pt).join("L")}L${lower.reverse().map(pt).join("L")}Z`,
    center: `M${center.slice(0, Math.round(N * 0.85)).map(pt).join("L")}`,
  };
}

/** Phoenix streamers: a few long flame-shaped tail plumes trailing from the wing tip. */
function streamers(c: Ctx, hull: Pt[]): string {
  const { g, gen, rnd, langs } = c;
  let out = "";
  for (let k = 0; k < 4; k++) {
    const t = 0.98 - k * 0.06;
    const b = g.bone(t);
    const a = g.angle(t) + 10 + k * 6;
    const L = g.length(t) * (1.6 - k * 0.12);
    const w = L * 0.085;
    const li = c.langAt(k / 8);
    const color = langs[li].color;
    const p = (x: number, y: number) => `${f(L * x)} ${f(w * y)}`;
    out +=
      `<g transform="translate(${pt(b)}) rotate(${f(a)})"><g class="sway" style="animation-delay:-${f(rnd() * gen.tempo)}s;animation-duration:${f(gen.tempo * 1.3)}s">` +
      `<path d="M0 0C${p(0.3, -0.5)} ${p(0.55, -1.2)} ${p(0.72, -0.9)}C${p(0.82, -0.7)} ${p(0.9, -1.3)} ${p(1.06, -0.6)}` +
      `C${p(0.94, 0.1)} ${p(0.84, 0.6)} ${p(0.7, 0.5)}C${p(0.5, 0.4)} ${p(0.25, 0.5)} 0 0Z" fill="url(#s${li})" stroke="${tint(color, 0.4)}" stroke-width=".6" stroke-opacity=".6"/>` +
      `<path d="M2 0Q${p(0.5, -0.2)} ${p(0.98, -0.6)}" stroke="${tint(gen.accent, 0.5)}" stroke-width=".9" fill="none" opacity=".55"/>` +
      (gen.marking === "eyes" ? ocellus(L * 0.86, -w * 0.3, w * 0.55, color, gen.accent) : "") +
      `</g></g>`;
    hull.push(add(b, rot({ x: L * 1.08, y: 0 }, a)));
  }
  return out;
}

// ─── Renderer ─────────────────────────────────────────────────────────

export const GITWINGS_URL = "https://github.com/Quaximur/GitWings";

const MIN_W = 560;
const LEGEND_ROWS = 4;
const DEFAULT_LANG: LanguageStat = { name: "Code", share: 1, color: "#8b949e", icon: null, url: "https://github.com" };

/** The smaller pairs that grow behind the main one: transform and how to map a point through it. */
const ECHOES = [
  { tx: -6, ty: -0.1, rot: -30, k: 0.56 },
  { tx: -4, ty: 0.12, rot: 34, k: 0.5 },
];

export function renderWings(stats: WingStats, opts: RenderOptions = {}): string {
  const animate = opts.animate ?? true;
  const showLabel = opts.label ?? true;
  const theme = opts.theme ?? "auto";
  const gen = genomeFor(opts.seed ?? stats.subject);
  const rnd = seededRandom(gen.seed);
  const tier = tierFor(stats.stars);
  const langs = stats.languages.length ? stats.languages : [DEFAULT_LANG];
  const primary = langs[0];

  // stars → size
  const starPower = clamp(Math.log10(stats.stars + 1) / 4.7, 0, 1);
  const span = 300 * lerp(0.66, 1, starPower);
  const g = makeGeometry(span, gen);
  const gap = 34;

  // activity → feathers & layers
  const activity = activityOf(stats);
  const commitPower = Math.log10(activity.count + 1);
  const n0 = Math.round(clamp(7 + 3 * commitPower, 7, 19));
  const layerCount = activity.count >= 2000 ? 4 : activity.count >= 300 ? 3 : activity.count >= 30 ? 2 : 1;

  // stack → shape & traits
  const feather: Feather = SHAPE_BY_LANGUAGE[primary.name] ?? gen.feather;
  const traitWeight = new Map<Trait, number>();
  for (const t of stats.tech) traitWeight.set(t.trait, (traitWeight.get(t.trait) ?? 0) + 1);
  for (const l of langs.slice(0, 2)) {
    const t = TRAIT_BY_LANGUAGE[l.name];
    if (t && l.share > 0.15) traitWeight.set(t, (traitWeight.get(t) ?? 0) + 1);
  }
  const traits = [...traitWeight.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);
  const has = (t: Trait) => traitWeight.has(t);

  // Language sectors: tip (u=0) → body (u=1)
  const cumulative: number[] = [];
  langs.reduce((acc, l) => (cumulative.push(acc + l.share), acc + l.share), 0);
  const langAt = (u: number) => {
    const total = cumulative[cumulative.length - 1];
    const i = cumulative.findIndex((c) => u * total <= c + 1e-9);
    return i < 0 ? langs.length - 1 : i;
  };

  const defs: string[] = [];
  langs.forEach((l, li) =>
    LAYER_TINTS.forEach((_, layer) => {
      const base = layerColor(l.color, layer);
      defs.push(
        `<linearGradient id="g${li}_${layer}" x1="0" y1="0" x2="1" y2="0">` +
          `<stop offset="0" stop-color="${shade(base, 0.45)}"/><stop offset=".55" stop-color="${base}"/>` +
          `<stop offset="1" stop-color="${tint(base, 0.5)}"/></linearGradient>`,
      );
      if (gen.marking === "bands" && layer < 2) {
        defs.push(
          `<linearGradient id="b${li}_${layer}" x1="0" y1="0" x2="1" y2="0">` +
            `<stop offset="0" stop-color="${shade(base, 0.45)}"/><stop offset=".56" stop-color="${base}"/>` +
            `<stop offset=".56" stop-color="${shade(base, 0.6)}"/><stop offset=".64" stop-color="${shade(base, 0.6)}"/>` +
            `<stop offset=".64" stop-color="${mix(tint(base, 0.35), gen.accent, 0.35)}"/><stop offset="1" stop-color="${tint(base, 0.55)}"/></linearGradient>`,
        );
      }
      if (gen.trail === "streamers" && layer === 0) {
        defs.push(
          `<linearGradient id="s${li}" x1="0" y1="0" x2="1" y2="0">` +
            `<stop offset="0" stop-color="${shade(base, 0.3)}" stop-opacity=".95"/><stop offset=".55" stop-color="${tint(l.color, 0.1)}"/>` +
            `<stop offset="1" stop-color="${gen.accent}" stop-opacity=".9"/></linearGradient>`,
        );
      }
      if ((gen.primaries === "ribbons" || gen.trail === "ribbons") && layer < 3) {
        defs.push(
          `<linearGradient id="p${li}_${layer}" x1="0" y1="0" x2="1" y2="0">` +
            `<stop offset="0" stop-color="${tint(base, 0.15)}" stop-opacity=".92"/><stop offset=".45" stop-color="${base}" stop-opacity=".62"/>` +
            `<stop offset="1" stop-color="${gen.accent}" stop-opacity="0"/></linearGradient>`,
        );
      }
    }),
  );
  defs.push(
    `<linearGradient id="metal" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${tier.metalLight}"/>` +
      `<stop offset=".5" stop-color="${tier.metal}"/><stop offset="1" stop-color="${shade(tier.metal, 0.35)}"/></linearGradient>`,
    `<linearGradient id="prism" gradientUnits="userSpaceOnUse" x1="0" y1="${f(-span * 0.6)}" x2="${f(span)}" y2="${f(span * 0.4)}">` +
      ["#ff6ec7", "#ffd36e", "#6effa8", "#6ec8ff", "#b26eff"].map((c, i) => `<stop offset="${i / 4}" stop-color="${c}"/>`).join("") +
      `</linearGradient>`,
    `<filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${f(6 + 10 * starPower)}"/></filter>`,
    `<filter id="soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2"/></filter>`,
    `<radialGradient id="core"><stop offset="0" stop-color="${tint(primary.color, 0.6)}"/><stop offset="1" stop-color="${shade(primary.color, 0.55)}"/></radialGradient>`,
  );

  // ── Wing (right side, local coords; left side is a mirrored <use>) ──
  const ctx: Ctx = { span, g, langs, langAt, layerCount, n0, feather, tier, starPower, gen, rnd, has, defs };
  const art = composeWing(ctx);
  const wing = art.body;
  const ag = g;
  if (has("hex")) wing.push(hexPlates(ag, tier));
  if (has("runes")) wing.push(runes(ag, tier, rnd));
  if (has("neural")) {
    const lens = [0.55, 0.36, 0.22];
    const grid = lens.slice(0, clamp(layerCount, 2, 3)).map((k, r) => {
      const n = Math.max(4, n0 - r * 2);
      return Array.from({ length: n }, (_, i) => along(ag, lerp(0.95, 0.05, i / (n - 1)), k, 1));
    });
    wing.push(neural(grid, rnd));
  }
  defs.push(`<g id="wing">${wing.join("")}</g>`);

  // ── Canvas: hug the wings at both ends of the wingbeat, including echo pairs ──
  const [beatUp, beatDown] = gen.beat;
  const echoes = ECHOES.slice(0, gen.echoes);
  const echoHull = echoes.flatMap((e) => art.hull.map((p) => add({ x: e.tx, y: e.ty * span }, rot(scale(p, e.k), e.rot))));
  const reach = [...art.hull, ...echoHull].flatMap((p) => (animate ? [rot(p, beatDown), rot(p, -beatUp)] : [p]));
  const maxX = Math.max(...reach.map((p) => p.x));
  const minY = Math.min(...reach.map((p) => p.y));
  const maxY = Math.max(...reach.map((p) => p.y));
  const W = Math.max(MIN_W, Math.round(2 * Math.max(gap + maxX + 14, span * 1.3) + 32));
  const cx = W / 2;
  const cy = Math.round(Math.max(-minY + 12, span * 0.62) + 16);
  const sigilR = span * 0.5;

  // ── Scene ──
  const scene: string[] = [];
  const back: string[] = [];
  const front: string[] = [];

  back.push(sigil(cx, cy + 8, sigilR, gen));
  if (has("constellation")) back.push(constellation(cx, cy, span, rnd));
  if (has("aurora")) back.push(aurora(cx, cy, span, langs));
  if (stats.stars >= 1000) back.push(halo(cx, cy - span * 0.58, tier, starPower));

  const sides = [
    { sign: 1, badges: langs.slice(0, 6).map(langBadge) },
    { sign: -1, badges: stats.tech.slice(0, 6).map(techBadge) },
  ];
  const glowing = stats.stars >= 50 || gen.primaries === "ribbons" || gen.bone === "spectral";
  for (const side of sides) {
    const mirror = side.sign < 0 ? " scale(-1 1)" : "";
    const glow = glowing ? `<use href="#wing" filter="url(#glow)" opacity="${f(0.25 + 0.35 * starPower)}"/>` : "";
    const echo = echoes
      .map((e) => `<use href="#wing" transform="translate(${f(e.tx)} ${f(e.ty * span)}) rotate(${e.rot}) scale(${e.k})" opacity=".62"/>`)
      .join("");
    const slots = side.badges.length;
    const badges = side.badges
      .map((b, i) => {
        const p = along(ag, slots === 1 ? 0.55 : lerp(0.86, 0.14, i / (slots - 1)), layerCount >= 2 ? 0.62 : 0.85, 0.55);
        return `<g transform="translate(${pt(p)})${mirror}">${b(13, tier)}</g>`;
      })
      .join("");
    scene.push(
      `<g transform="translate(${f(cx + side.sign * gap)} ${cy})${mirror}"><g class="flap">${echo}${glow}<use href="#wing"/>${badges}</g></g>`,
    );
  }

  scene.push(heart(cx, cy + 8, langs, tier, stats));

  if (has("ember")) front.push(embers(cx, cy, span, gap, rnd));
  if (has("pixel")) front.push(pixels(cx, cy, span, langs, rnd));
  if (has("crystal")) front.push(crystals(cx, cy, span, rnd));
  front.push(motes(cx, cy, span, gen, rnd));
  front.push(sparkles(cx, cy, span, stats.stars, tier, rnd));

  // ── Label ──
  const wingBottom = cy + Math.max(maxY, sigilR * 1.22 + 8);
  const labelY = wingBottom + 34;
  const credit = opts.credit ?? true;
  const label = showLabel ? renderLabel(stats, tier, gen, langs, opts.title, labelY, W, credit, opts.legend ?? true) : null;
  const height = label ? labelY + 92 + (label.rows - 1) * 20 + (credit ? 26 : 0) : wingBottom + 30;

  const style = `
    .t1{font:700 22px 'Segoe UI',Ubuntu,'Helvetica Neue',sans-serif;fill:var(--fg)}
    .t2{font:500 13px 'Segoe UI',Ubuntu,'Helvetica Neue',sans-serif;fill:var(--muted)}
    .t3{font:500 12px 'Segoe UI',Ubuntu,'Helvetica Neue',sans-serif;fill:var(--muted)}
    .t4{font:500 11px 'Segoe UI',Ubuntu,'Helvetica Neue',sans-serif;letter-spacing:.14em;fill:var(--muted)}
    .tq{font:italic 500 14px Georgia,'Times New Roman',serif;letter-spacing:.06em;fill:var(--quirk)}
    svg{--fg:${theme === "dark" ? "#e6edf3" : "#1f2328"};--muted:${theme === "dark" ? "#9198a1" : "#59636e"};--card:${theme === "dark" ? "#0d1117" : "#ffffff"};--quirk:${theme === "dark" ? gen.accent : gen.accentDeep}}
    ${theme === "auto" ? `@media (prefers-color-scheme:dark){svg{--fg:#e6edf3;--muted:#9198a1;--card:#0d1117;--quirk:${gen.accent}}}` : ""}
    a{cursor:pointer}
    ${
      animate
        ? `.flap{transform-origin:0 0;animation:flap ${f(gen.tempo)}s ease-in-out infinite}
    @keyframes flap{0%,100%{transform:rotate(${f(beatDown)}deg)}50%{transform:rotate(${f(-beatUp)}deg)}}
    .bob{animation:bob ${f(gen.tempo)}s ease-in-out infinite}
    @keyframes bob{0%,100%{transform:translateY(3px)}50%{transform:translateY(-4px)}}
    .sway{transform-origin:0 0;animation:sway 6s ease-in-out infinite}
    @keyframes sway{0%,100%{transform:rotate(-4deg)}50%{transform:rotate(5deg)}}
    .spin{transform-origin:0 0;animation:spin 160s linear infinite}
    .spin-r{transform-origin:0 0;animation:spin 110s linear infinite reverse}
    @keyframes spin{to{transform:rotate(360deg)}}
    .tw{animation:tw 2.8s ease-in-out infinite}
    @keyframes tw{0%,100%{opacity:.15}50%{opacity:1}}
    .px{animation:px 1.6s steps(2) infinite}
    @keyframes px{0%{opacity:0}100%{opacity:1}}
    .rise{animation:rise 3.2s ease-in infinite}
    @keyframes rise{0%{transform:translateY(0);opacity:0}15%{opacity:1}100%{transform:translateY(-70px);opacity:0}}
    .drift{animation:drift 7s ease-in-out infinite}
    @keyframes drift{0%,100%{transform:translate(0,0);opacity:.15}50%{transform:translate(7px,-14px);opacity:1}}
    .float{animation:float 5s ease-in-out infinite}
    @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
    .pulse{animation:pulse 2.4s ease-in-out infinite}
    @keyframes pulse{0%,100%{opacity:.35}50%{opacity:1}}
    @media (prefers-reduced-motion:reduce){*{animation:none!important}}`
        : ""
    }`;

  const bg = opts.background
    ? `<rect x=".5" y=".5" width="${W - 1}" height="${f(height - 1)}" rx="14" fill="var(--card)" stroke="#8b949e" stroke-opacity=".25"/>`
    : "";
  const desc = `${stats.subject}: ${tier.name} wings, quirk “${gen.quirk}” — ${stats.stars} stars, ${activity.count} ${activity.noun}; ${langs.map((l) => l.name).join(", ")}${stats.tech.length ? "; " + stats.tech.map((t) => t.label).join(", ") : ""}`;

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${W} ${f(height)}" width="${W}" height="${f(height)}" role="img" aria-label="${esc(desc)}">` +
    `<title>${esc(desc)}</title><style>${style}</style><defs>${defs.join("")}</defs>${bg}` +
    `<g class="bob">${back.join("")}${scene.join("")}${front.join("")}</g>${label?.svg ?? ""}` +
    `<!-- genes: ${gen.primaries} primaries, ${gen.coverts} coverts, ${gen.trail} trail, ${gen.bone} bone, ${gen.echoes} echoes, ${gen.sigil.frame} sigil · quirk: ${gen.quirk} · traits: ${traits.join(", ") || "none"} · feather: ${feather} · marking: ${gen.marking} · layers: ${layerCount} · feathers: ${n0} -->` +
    `</svg>`
  );
}

// ─── Badges (icons with links) ────────────────────────────────────────

type Badge = (r: number, tier: Tier) => string;

function iconBadge(name: string, url: string, iconSlug: string | null, fallbackColor: string, caption: string): Badge {
  const icon = getIcon(iconSlug);
  const disc = icon?.hex ?? fallbackColor;
  const ink = luminance(disc) > 0.45 ? "#111111" : "#ffffff";
  return (r, tier) => {
    const s = (r * 1.25) / 24;
    const glyph = icon
      ? `<path d="${icon.path}" fill="${ink}" transform="scale(${Math.round(s * 1000) / 1000}) translate(-12 -12)"/>`
      : `<text y="${f(r * 0.36)}" text-anchor="middle" font-family="'Segoe UI',sans-serif" font-weight="700" font-size="${f(r * 0.95)}" fill="${ink}">${esc(monogram(name))}</text>`;
    return (
      `<a href="${esc(url)}" xlink:href="${esc(url)}" target="_blank"><title>${esc(caption)}</title>` +
      `<circle r="${f(r + 3)}" fill="${shade(tier.metal, 0.55)}" opacity=".55" filter="url(#soft)"/>` +
      `<circle r="${f(r + 1.5)}" fill="url(#metal)"/>` +
      `<circle r="${f(r)}" fill="${disc}"/>` +
      `<circle r="${f(r)}" fill="none" stroke="#ffffff" stroke-opacity=".35" stroke-width=".8"/>` +
      glyph +
      `</a>`
    );
  };
}

function monogram(name: string): string {
  // Words, or CamelCase parts of a single word: "UniTask" → UT, "gRPC" → GR, "VContainer" → VC.
  let parts = name.replace(/[^A-Za-z0-9+# ]/g, " ").trim().split(/\s+/);
  if (parts.length === 1) parts = name.match(/[A-Z]?[a-z]+|[A-Z]+(?![a-z])|\d+/g) ?? parts;
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : name.slice(0, 2)).replace(/^./, (c) => c.toUpperCase());
}

const inRepos = (n?: number) => (n ? ` · ${n} repo${n === 1 ? "" : "s"}` : "");
const langBadge = (l: LanguageStat): Badge =>
  iconBadge(l.name, l.url, l.icon, l.color, `${l.name} — ${(l.share * 100).toFixed(1)}%${inRepos(l.repos)}`);
const techBadge = (t: TechStat): Badge => iconBadge(t.label, t.url, t.icon, "#6e7681", `${t.label}${inRepos(t.repos)}`);

// ─── Heart: language donut with the top language in the middle ───────

function heart(x: number, y: number, langs: LanguageStat[], tier: Tier, stats: WingStats): string {
  const r = 24;
  const C = 2 * Math.PI * r;
  let offset = 0;
  const total = langs.reduce((s, l) => s + l.share, 0) || 1;
  const ring = langs
    .map((l) => {
      const len = (l.share / total) * C;
      const seg = `<circle r="${r}" fill="none" stroke="${l.color}" stroke-width="7" stroke-dasharray="${f(len)} ${f(C)}" stroke-dashoffset="${f(-offset)}" transform="rotate(-90)"><title>${esc(`${l.name} ${(l.share * 100).toFixed(1)}%`)}</title></circle>`;
      offset += len;
      return seg;
    })
    .join("");
  const icon = getIcon(langs[0].icon);
  const core = icon
    ? `<path d="${icon.path}" fill="#ffffff" transform="scale(.75) translate(-12 -12)"/>`
    : `<text y="6" text-anchor="middle" font-family="'Segoe UI',sans-serif" font-weight="700" font-size="16" fill="#fff">${esc(monogram(langs[0].name))}</text>`;
  return (
    `<g transform="translate(${f(x)} ${f(y)})"><a href="${esc(stats.url)}" xlink:href="${esc(stats.url)}" target="_blank"><title>${esc(stats.subject)}</title>` +
    `<circle r="${r + 12}" fill="${langs[0].color}" opacity=".35" filter="url(#glow)"/>` +
    `<circle r="${r + 5}" fill="url(#metal)"/><circle r="${r + 3.5}" fill="#0d1117"/>${ring}` +
    `<circle r="${r - 4.5}" fill="url(#core)"/><circle r="${r - 4.5}" fill="none" stroke="${tier.metalLight}" stroke-opacity=".6"/>${core}</a></g>`
  );
}

// ─── Sigil: the arcane circle behind the wings, a fingerprint of the name ──

const GLYPHS = [
  (s: number) => `M0 ${-s}V${s}M0 ${-s}L${s} ${-s * 0.3}`,
  (s: number) => `M${-s} ${s}L0 ${-s}L${s} ${s}`,
  (s: number) => `M${-s} ${-s}L${s} ${s}M${s} ${-s}L${-s} ${s}`,
  (s: number) => `M0 ${-s}V${s}M${-s} 0H${s}`,
  (s: number) => `M${-s} ${-s}H${s}L${-s} ${s}H${s}`,
  (s: number) => `M0 ${-s}L${s} 0L0 ${s}L${-s} 0Z`,
  (s: number) => `M${-s} ${s}V${-s}L${s} ${s}V${-s}`,
  (s: number) => `M${-s} 0A${s} ${s} 0 1 1 ${s} 0M0 0V${s}`,
];

function sigil(cx: number, cy: number, r: number, gen: Genome): string {
  const { frame, points, step, ticks, glyphs, moons } = gen.sigil;
  const ring = (k: number, w: number, o = 1) => `<circle r="${f(r * k)}" fill="none" stroke-width="${w}" opacity="${o}"/>`;
  let tickD = "";
  ticks.forEach((t, i) => {
    const a = (Math.PI * 2 * i) / ticks.length;
    const len = r * (0.015 + 0.06 * t);
    tickD += `M${f(Math.cos(a) * r * 0.92)} ${f(Math.sin(a) * r * 0.92)}L${f(Math.cos(a) * (r * 0.92 + len))} ${f(Math.sin(a) * (r * 0.92 + len))}`;
  });
  const glyphD = glyphs
    .map((kind, i) => {
      const a = (360 * i) / glyphs.length;
      return `<path d="${GLYPHS[kind](r * 0.035)}" transform="rotate(${f(a)}) translate(${f(r * 1.08)} 0) rotate(90)"/>`;
    })
    .join("");
  // Star polygon {points/step}; a compound one is drawn as several cycles.
  let starD = "";
  const vertex = (i: number) => {
    const a = (Math.PI * 2 * i) / points - Math.PI / 2;
    return `${f(Math.cos(a) * r * 0.86)} ${f(Math.sin(a) * r * 0.86)}`;
  };
  const visited = new Set<number>();
  for (let s = 0; s < points; s++) {
    if (visited.has(s)) continue;
    let i = s;
    starD += `M${vertex(i)}`;
    do {
      visited.add(i);
      i = (i + step) % points;
      starD += `L${vertex(i)}`;
    } while (i !== s);
  }
  const inner = Array.from({ length: points }, (_, i) => {
    const a = (Math.PI * 2 * i) / points + Math.PI / 2;
    return `${i ? "L" : "M"}${f(Math.cos(a) * r * 0.42)} ${f(Math.sin(a) * r * 0.42)}`;
  }).join("") + "Z";
  const moonDots = Array.from({ length: moons }, (_, i) => {
    const a = (Math.PI * 2 * i) / moons + gen.hue;
    return `<circle cx="${f(Math.cos(a) * r * 0.64)}" cy="${f(Math.sin(a) * r * 0.64)}" r="${f(r * 0.03)}" fill="${gen.accent}" stroke="none"/>`;
  }).join("");
  // An outer frame around the glyph ring: a polygon with a dot on every vertex.
  const sides = { rings: 0, hexagon: 6, triangle: 3, square: 4 }[frame];
  const corners = Array.from({ length: sides }, (_, i) => {
    const a = (Math.PI * 2 * i) / sides - Math.PI / 2;
    return { x: Math.cos(a) * r * 1.2, y: Math.sin(a) * r * 1.2 };
  });
  const frameD = sides
    ? `<path d="M${corners.map(pt).join("L")}Z" stroke-width=".8" stroke-linejoin="round"/>` +
      corners.map((p) => `<circle cx="${f(p.x)}" cy="${f(p.y)}" r="${f(r * 0.025)}" fill="${gen.accent}" stroke="none"/>`).join("")
    : ring(1.18, 0.5, 0.6);
  return (
    `<g transform="translate(${f(cx)} ${f(cy)})" stroke="${gen.accent}" fill="none" opacity=".3">` +
    `<g class="spin-r">${frameD}</g>` +
    `<g class="spin">${ring(1, 1)}${ring(0.92, 0.6)}<path d="${tickD}" stroke-width=".7"/><g stroke-width=".9" stroke-linecap="round">${glyphD}</g></g>` +
    `<g class="spin-r"><path d="${starD}" stroke-width=".8" stroke-linejoin="round"/>${ring(0.64, 0.5, 0.7)}${moonDots}</g>` +
    `<g class="spin"><path d="${inner}" stroke-width=".7"/>${ring(0.42, 0.6)}${ring(0.14, 0.8)}</g>` +
    `</g>`
  );
}

// ─── Motes: ambient particles of the genome ──────────────────────────

function motes(cx: number, cy: number, span: number, gen: Genome, rnd: () => number): string {
  return Array.from({ length: 16 }, () => {
    const x = cx + (rnd() - 0.5) * span * 2.4;
    const y = cy - span * 0.55 + rnd() * span * 0.95;
    const delay = `animation-delay:-${f(rnd() * 9)}s`;
    switch (gen.motes) {
      case "fireflies": {
        const r = 1.3 + rnd() * 1.2;
        return (
          `<g class="drift" style="${delay};animation-duration:${f(5 + rnd() * 5)}s">` +
          `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r * 3)}" fill="${gen.accent}" opacity=".35" filter="url(#soft)"/>` +
          `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="${tint(gen.accent, 0.6)}"/></g>`
        );
      }
      case "ash":
        return `<rect class="rise" x="${f(x)}" y="${f(y + span * 0.3)}" width="${f(1.5 + rnd() * 2)}" height="${f(1 + rnd() * 1.5)}" fill="${mix(gen.accent, "#8b949e", 0.5)}" transform="rotate(${f(rnd() * 90)} ${f(x)} ${f(y + span * 0.3)})" style="${delay};animation-duration:${f(3 + rnd() * 3)}s"/>`;
      case "sparks":
        return `<path class="rise" d="M${f(x)} ${f(y + span * 0.3)}l${f((rnd() - 0.5) * 3)} -${f(4 + rnd() * 5)}" stroke="${tint(gen.accent, 0.4)}" stroke-width="1.3" stroke-linecap="round" style="${delay};animation-duration:${f(2.4 + rnd() * 2)}s"/>`;
      default:
        return `<circle class="tw" cx="${f(x)}" cy="${f(y)}" r="${f(0.6 + rnd() * 1)}" fill="${tint(gen.accent, 0.5)}" style="${delay}"/>`;
    }
  }).join("");
}

// ─── Traits ───────────────────────────────────────────────────────────

function halo(x: number, y: number, tier: Tier, power: number): string {
  const rx = 30 + 14 * power;
  return (
    `<g class="pulse"><ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(rx)}" ry="${f(rx * 0.22)}" fill="none" stroke="${tier.metal}" stroke-width="7" opacity=".5" filter="url(#glow)"/>` +
    `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(rx)}" ry="${f(rx * 0.22)}" fill="none" stroke="url(#metal)" stroke-width="3.5"/></g>`
  );
}

function aurora(cx: number, cy: number, span: number, langs: LanguageStat[]): string {
  const out: string[] = [];
  [0, 1, 2].forEach((i) => {
    const rx = span * (0.95 + i * 0.16);
    const ry = span * (0.2 + i * 0.05);
    const rot = [-12, 9, -4][i];
    const color = tint(langs[i % langs.length].color, 0.3);
    const d = `M${f(-rx)} 0A${f(rx)} ${f(ry)} 0 1 0 ${f(rx)} 0A${f(rx)} ${f(ry)} 0 1 0 ${f(-rx)} 0`;
    out.push(
      `<g transform="translate(${f(cx)} ${f(cy + 10)}) rotate(${rot})">` +
        `<path d="${d}" fill="none" stroke="${color}" stroke-width="1.2" opacity=".35"/>` +
        `<circle r="3.2" fill="${tint(color, 0.5)}"><animateMotion dur="${7 + i * 3}s" repeatCount="indefinite" path="${d}"/></circle>` +
        `<circle r="9" fill="${color}" opacity=".4" filter="url(#soft)"><animateMotion dur="${7 + i * 3}s" repeatCount="indefinite" path="${d}"/></circle></g>`,
    );
  });
  return out.join("");
}

function runes(g: Geometry, tier: Tier, rnd: () => number): string {
  let d = "";
  for (let i = 0; i < 9; i++) {
    const t = 0.1 + i * 0.095;
    const p = g.bone(t);
    const s = 3.2;
    const kinds = [
      `M${f(p.x)} ${f(p.y - s)}V${f(p.y + s)}M${f(p.x)} ${f(p.y - s)}L${f(p.x + s)} ${f(p.y - s * 0.3)}`,
      `M${f(p.x - s)} ${f(p.y + s)}L${f(p.x)} ${f(p.y - s)}L${f(p.x + s)} ${f(p.y + s)}`,
      `M${f(p.x - s)} ${f(p.y - s)}L${f(p.x + s)} ${f(p.y + s)}M${f(p.x + s)} ${f(p.y - s)}L${f(p.x - s)} ${f(p.y + s)}`,
      `M${f(p.x)} ${f(p.y - s)}V${f(p.y + s)}M${f(p.x - s)} ${f(p.y)}H${f(p.x + s)}`,
      `M${f(p.x - s)} ${f(p.y - s)}H${f(p.x + s)}L${f(p.x - s)} ${f(p.y + s)}H${f(p.x + s)}`,
    ];
    d += kinds[Math.floor(rnd() * kinds.length)];
  }
  return (
    `<g class="pulse"><path d="${d}" stroke="${tier.metalLight}" stroke-width="2.6" fill="none" opacity=".6" filter="url(#soft)"/>` +
    `<path d="${d}" stroke="#ffffff" stroke-width="1" fill="none" stroke-linecap="round"/></g>`
  );
}

function neural(layers: Pt[][], rnd: () => number): string {
  const nodes = layers.slice(0, 3).flatMap((pts, li) => pts.filter((_, i) => (i + li) % 2 === 0));
  let edges = "";
  nodes.forEach((a, i) => {
    const near = nodes
      .map((b, j) => ({ j, d: Math.hypot(a.x - b.x, a.y - b.y) }))
      .filter((n) => n.j > i)
      .sort((x, y) => x.d - y.d)
      .slice(0, 2);
    for (const n of near) edges += `M${f(a.x)} ${f(a.y)}L${f(nodes[n.j].x)} ${f(nodes[n.j].y)}`;
  });
  const dots = nodes
    .map((p) => `<circle class="pulse" cx="${f(p.x)}" cy="${f(p.y)}" r="2.4" fill="#aef4ff" style="animation-delay:${f(rnd() * 2.4)}s"/>`)
    .join("");
  return `<g><path d="${edges}" stroke="#7ee7ff" stroke-width=".9" opacity=".55" fill="none"/>${dots}</g>`;
}

function hexPlates(g: Geometry, tier: Tier): string {
  let d = "";
  const r = 4.2;
  for (let i = 0; i < 12; i++) {
    const t = 0.05 + i * 0.05;
    for (let row = 1; row <= 2; row++) {
      const p = along(g, t, 0.1 * row, 1);
      for (let k = 0; k < 6; k++) {
        const a = (Math.PI / 3) * k + Math.PI / 6;
        d += `${k ? "L" : "M"}${f(p.x + r * Math.cos(a))} ${f(p.y + r * Math.sin(a))}`;
      }
      d += "Z";
    }
  }
  return `<path d="${d}" fill="${tier.metal}" fill-opacity=".28" stroke="${tier.metalLight}" stroke-width=".8" stroke-opacity=".8"/>`;
}

function constellation(cx: number, cy: number, span: number, rnd: () => number): string {
  const stars: Pt[] = Array.from({ length: 14 }, () => ({
    x: cx + (rnd() - 0.5) * span * 2.6,
    y: cy - span * 0.15 - rnd() * span * 0.55,
  }));
  const chain = [...stars].sort((a, b) => a.x - b.x).slice(0, 9);
  const d = "M" + chain.map((p) => `${f(p.x)} ${f(p.y)}`).join("L");
  const dots = stars
    .map((p) => `<circle class="tw" cx="${f(p.x)}" cy="${f(p.y)}" r="${f(0.8 + rnd() * 1.6)}" fill="#cfe3ff" style="animation-delay:${f(rnd() * 3)}s"/>`)
    .join("");
  return `<g opacity=".8"><path d="${d}" stroke="#9cc3ff" stroke-width=".7" opacity=".4" fill="none"/>${dots}</g>`;
}

function embers(cx: number, cy: number, span: number, gap: number, rnd: () => number): string {
  return Array.from({ length: 18 }, () => {
    const side = rnd() < 0.5 ? -1 : 1;
    const x = cx + side * (gap + rnd() * span * 1.0);
    const y = cy + span * (0.1 + rnd() * 0.35);
    const c = ["#ffb347", "#ff7b3a", "#ffd56b"][Math.floor(rnd() * 3)];
    return `<circle class="rise" cx="${f(x)}" cy="${f(y)}" r="${f(1 + rnd() * 1.8)}" fill="${c}" style="animation-delay:${f(rnd() * 3.2)}s;animation-duration:${f(2.6 + rnd() * 1.6)}s"/>`;
  }).join("");
}

function pixels(cx: number, cy: number, span: number, langs: LanguageStat[], rnd: () => number): string {
  return Array.from({ length: 22 }, () => {
    const s = rnd() < 0.3 ? 5 : 3;
    const x = cx + (rnd() - 0.5) * span * 2.5;
    const y = cy - span * 0.6 + rnd() * span * 1.1;
    const c = tint(langs[Math.floor(rnd() * langs.length)].color, 0.35);
    return `<rect class="px" x="${f(x)}" y="${f(y)}" width="${s}" height="${s}" fill="${c}" style="animation-delay:${f(rnd() * 1.6)}s"/>`;
  }).join("");
}

function crystals(cx: number, cy: number, span: number, rnd: () => number): string {
  return Array.from({ length: 7 }, () => {
    const x = cx + (rnd() - 0.5) * span * 2.3;
    const y = cy - span * 0.4 + rnd() * span * 0.9;
    const h = 7 + rnd() * 7;
    return `<path class="float" d="M${f(x)} ${f(y - h)}L${f(x + h * 0.45)} ${f(y)}L${f(x)} ${f(y + h)}L${f(x - h * 0.45)} ${f(y)}Z" fill="#9f8cff" fill-opacity=".55" stroke="#e3dcff" stroke-width=".8" style="animation-delay:${f(rnd() * 5)}s"/>`;
  }).join("");
}

function sparkles(cx: number, cy: number, span: number, stars: number, tier: Tier, rnd: () => number): string {
  const n = Math.round(clamp(3 + 4.5 * Math.log10(stars + 1), 3, 28));
  return Array.from({ length: n }, () => {
    const x = cx + (rnd() - 0.5) * span * 2.4;
    const y = cy - span * 0.7 + rnd() * span * 1.2;
    const s = 2.5 + rnd() * 4.5;
    const d = `M${f(x)} ${f(y - s)}Q${f(x)} ${f(y)} ${f(x + s)} ${f(y)}Q${f(x)} ${f(y)} ${f(x)} ${f(y + s)}Q${f(x)} ${f(y)} ${f(x - s)} ${f(y)}Q${f(x)} ${f(y)} ${f(x)} ${f(y - s)}Z`;
    return `<path class="tw" d="${d}" fill="${tier.metalLight}" style="animation-delay:${f(rnd() * 2.8)}s"/>`;
  }).join("");
}

// ─── Label ────────────────────────────────────────────────────────────

function renderLabel(
  stats: WingStats,
  tier: Tier,
  gen: Genome,
  langs: LanguageStat[],
  title: string | undefined,
  y: number,
  W: number,
  credit: boolean,
  showLegend: boolean,
): { svg: string; rows: number } {
  const name = title ?? stats.subject;
  const activity = activityOf(stats);
  const parts = [
    `${tier.name} wings`,
    `★ ${formatCount(stats.stars)}`,
    `${formatCount(activity.count)} ${activity.noun}`,
    stats.kind === "user" ? `${stats.repos} ${stats.includesPrivate ? "" : "public "}repos` : `${formatCount(stats.forks)} forks`,
  ];
  // Only technologies in the registry are detected, so the count is a lower bound.
  if (stats.tech.length) parts.push(`${stats.tech.length}+ technologies`);

  // Legend: languages (dot + %) then frameworks; links on each item. Wraps onto up to LEGEND_ROWS rows.
  const charW = 7;
  const maxW = W - 48;
  const rows: { items: string[]; w: number }[] = showLegend ? [{ items: [], w: 0 }] : [];
  const place = (w: number, item: (x: number) => string): boolean => {
    let row = rows[rows.length - 1];
    if (row.w + w > maxW && row.items.length) {
      if (rows.length === LEGEND_ROWS) return false;
      rows.push((row = { items: [], w: 0 }));
    }
    row.items.push(item(row.w));
    row.w += w;
    return true;
  };
  for (const l of showLegend ? langs : []) {
    const text = `${l.name} ${(l.share * 100).toFixed(0)}%`;
    const fits = place(
      12 + text.length * charW + 14,
      (x) =>
        `<a href="${esc(l.url)}" xlink:href="${esc(l.url)}" target="_blank"><circle cx="${f(x + 4)}" cy="-4" r="4" fill="${l.color}"/><text class="t3" x="${f(x + 12)}">${esc(text)}</text></a>`,
    );
    if (!fits) break;
  }
  for (const t of showLegend ? stats.tech : []) {
    const fits = place(
      (t.label.length + 2) * charW + 18,
      (x) => `<a href="${esc(t.url)}" xlink:href="${esc(t.url)}" target="_blank"><text class="t3" x="${f(x)}">◆ ${esc(t.label)}</text></a>`,
    );
    if (!fits) break;
  }
  const legend = rows
    .map((row, i) => `<g transform="translate(${f(W / 2 - row.w / 2)} ${f(y + 66 + i * 20)})">${row.items.join("")}</g>`)
    .join("");

  return {
    svg:
      `<g text-anchor="middle"><a href="${esc(stats.url)}" xlink:href="${esc(stats.url)}" target="_blank"><text class="t1" x="${W / 2}" y="${f(y)}">${esc(name)}</text></a>` +
      `<text class="tq" x="${W / 2}" y="${f(y + 22)}">✦ ${esc(gen.quirk)} ✦</text>` +
      `<text class="t2" x="${W / 2}" y="${f(y + 42)}">${esc(parts.join("  ·  "))}</text></g>` +
      legend +
      (credit ? creditLine(W / 2, y + 66 + rows.length * 20 + 12) : ""),
    rows: rows.length,
  };
}

/** "grown with Quaximur/GitWings": a feather, the link, and two hairlines fading out to the sides. */
function creditLine(x: number, y: number): string {
  // Rects, not lines: a bounding-box gradient does not paint a shape with zero height.
  const line = (side: number) =>
    `<rect x="${f(side > 0 ? x + 128 : x - 202)}" y="${f(y - 4.4)}" width="74" height=".8" fill="url(#credit-fade-${side > 0 ? "r" : "l"})"/>`;
  const fade = (id: string, from: number) =>
    `<linearGradient id="${id}" x1="${from}" x2="${1 - from}"><stop offset="0" stop-color="var(--quirk)" stop-opacity=".8"/><stop offset="1" stop-color="var(--quirk)" stop-opacity="0"/></linearGradient>`;
  return (
    `<defs>${fade("credit-fade-r", 0)}${fade("credit-fade-l", 1)}</defs>` +
    `<a href="${GITWINGS_URL}" xlink:href="${GITWINGS_URL}" target="_blank" opacity=".85"><title>Made with Quaximur/GitWings</title>` +
    line(-1) +
    line(1) +
    `<g transform="translate(${f(x - 116)} ${f(y - 4)}) rotate(-35)"><path d="M-7 0C-3 -4 3 -5 8 -3C4 0 -2 3 -7 0Z" fill="var(--quirk)"/><path d="M-9 1L7 -3" stroke="var(--quirk)" stroke-width=".7"/></g>` +
    `<text class="t4" x="${f(x + 6)}" y="${f(y)}" text-anchor="middle">grown with <tspan font-weight="700" fill="var(--fg)" text-decoration="underline">Quaximur/GitWings</tspan></text></a>`
  );
}
