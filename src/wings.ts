// Renders WingStats into an animated SVG.
//
// Mapping:
//   commits   → feather count and number of feather layers
//   stars     → wingspan, tier metal (bone, halo, badges), glow and sparkles
//   languages → feather colors (sectors from tip to body) + heart donut + badges
//   tech      → visual traits (aurora, runes, neural, pixel, ember, prism, hex, constellation, crystal) + badges
//   primary language family → feather shape (soft / blade / flowing)

import type { LanguageStat, TechStat, WingStats } from "./github.js";
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

function seededRandom(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 3432918353), (h = (h << 13) | (h >>> 19));
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const f = (n: number) => (Math.round(n * 10) / 10).toString();
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

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

export function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}k`;
  return String(n);
}

// ─── Wing geometry ────────────────────────────────────────────────────

interface Geometry {
  span: number;
  bone: (t: number) => Pt;
  angle: (t: number) => number; // degrees, SVG orientation
  length: (t: number) => number;
}

function makeGeometry(span: number): Geometry {
  const p0 = { x: 0, y: 0 };
  const p1 = { x: span * 0.24, y: -span * 0.6 };
  const p2 = { x: span * 0.64, y: -span * 0.5 };
  return {
    span,
    bone: (t) => ({
      x: (1 - t) ** 2 * p0.x + 2 * (1 - t) * t * p1.x + t * t * p2.x,
      y: (1 - t) ** 2 * p0.y + 2 * (1 - t) * t * p1.y + t * t * p2.y,
    }),
    angle: (t) => 102 - 80 * t ** 1.1,
    length: (t) => span * (0.4 + 0.17 * Math.sin(t * Math.PI * 0.55)),
  };
}

function along(g: Geometry, t: number, lenFactor: number, k: number): Pt {
  const b = g.bone(t);
  const a = (g.angle(t) * Math.PI) / 180;
  const l = g.length(t) * lenFactor * k;
  return { x: b.x + Math.cos(a) * l, y: b.y + Math.sin(a) * l };
}

function featherPath(shape: FeatherShape | "scale", L: number, w: number): string {
  switch (shape) {
    case "blade":
      return `M0 0L${f(L * 0.22)} ${f(-w * 0.95)}L${f(L)} ${f(-w * 0.12)}L${f(L * 0.9)} ${f(w * 0.38)}L${f(L * 0.18)} ${f(w * 0.75)}Z`;
    case "flowing":
      return `M0 0C${f(L * 0.4)} ${f(-w * 1.15)} ${f(L * 0.78)} ${f(-w * 0.25)} ${f(L * 1.06)} ${f(-w * 0.45)}C${f(L * 0.72)} ${f(w * 0.45)} ${f(L * 0.35)} ${f(w * 0.95)} 0 0Z`;
    case "scale":
      return `M0 0C${f(L * 0.15)} ${f(-w * 1.1)} ${f(L * 1.05)} ${f(-w * 1.0)} ${f(L)} 0C${f(L * 1.05)} ${f(w * 1.0)} ${f(L * 0.15)} ${f(w * 1.1)} 0 0Z`;
    default:
      return `M0 0C${f(L * 0.28)} ${f(-w * 1.05)} ${f(L * 0.8)} ${f(-w * 0.95)} ${f(L)} 0C${f(L * 0.82)} ${f(w * 0.72)} ${f(L * 0.3)} ${f(w * 0.85)} 0 0Z`;
  }
}

// ─── Renderer ─────────────────────────────────────────────────────────

const MIN_W = 560;
const LEGEND_ROWS = 3;
const DEFAULT_LANG: LanguageStat = { name: "Code", share: 1, color: "#8b949e", icon: null, url: "https://github.com" };

export function renderWings(stats: WingStats, opts: RenderOptions = {}): string {
  const animate = opts.animate ?? true;
  const showLabel = opts.label ?? true;
  const theme = opts.theme ?? "auto";
  const rnd = seededRandom(stats.subject);
  const tier = tierFor(stats.stars);
  const langs = stats.languages.length ? stats.languages : [DEFAULT_LANG];
  const primary = langs[0];

  // stars → size
  const starPower = clamp(Math.log10(stats.stars + 1) / 4.7, 0, 1);
  const span = 300 * lerp(0.66, 1, starPower);
  const g = makeGeometry(span);
  const gap = 34;
  // The canvas hugs the scene: wing tips reach ~1.2·span past the gap, scattered traits ~1.3·span from the center.
  const W = Math.max(MIN_W, Math.round(2 * Math.max(gap + span * 1.22, span * 1.3) + 32));
  const cx = W / 2;

  // commits → feathers & layers
  const commitPower = Math.log10(stats.commits + 1);
  const n0 = Math.round(clamp(7 + 3 * commitPower, 7, 19));
  const layerCount = stats.commits >= 2000 ? 4 : stats.commits >= 300 ? 3 : stats.commits >= 30 ? 2 : 1;

  // stack → shape & traits
  const shape = SHAPE_BY_LANGUAGE[primary.name] ?? "soft";
  const traitWeight = new Map<Trait, number>();
  for (const t of stats.tech) traitWeight.set(t.trait, (traitWeight.get(t.trait) ?? 0) + 1);
  for (const l of langs.slice(0, 2)) {
    const t = TRAIT_BY_LANGUAGE[l.name];
    if (t && l.share > 0.15) traitWeight.set(t, (traitWeight.get(t) ?? 0) + 1);
  }
  const traits = [...traitWeight.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);
  const has = (t: Trait) => traitWeight.has(t);
  // Sparkles reach 0.7·span above the shoulders, a constellation 0.95·span.
  const cy = Math.round(span * (has("constellation") ? 0.95 : 0.72) + 16);

  // Language sectors: tip (u=0) → body (u=1)
  const cumulative: number[] = [];
  langs.reduce((acc, l) => (cumulative.push(acc + l.share), acc + l.share), 0);
  const langIndexAt = (u: number) => {
    const total = cumulative[cumulative.length - 1];
    const i = cumulative.findIndex((c) => u * total <= c + 1e-9);
    return i < 0 ? langs.length - 1 : i;
  };

  const defs: string[] = [];
  const layerTints = [-0.22, 0, 0.18, 0.36];
  langs.forEach((l, li) =>
    layerTints.forEach((k, layer) => {
      const base = k < 0 ? shade(l.color, -k) : tint(l.color, k);
      defs.push(
        `<linearGradient id="g${li}_${layer}" x1="0" y1="0" x2="1" y2="0">` +
          `<stop offset="0" stop-color="${shade(base, 0.45)}"/><stop offset=".55" stop-color="${base}"/>` +
          `<stop offset="1" stop-color="${tint(base, 0.5)}"/></linearGradient>`,
      );
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
  const wing: string[] = [];
  const layerSpecs = [
    { len: 1.0, width: 0.15, from: 0, to: 1, count: n0, shape },
    { len: 0.66, width: 0.17, from: 0.02, to: 0.93, count: n0 - 1, shape },
    { len: 0.42, width: 0.2, from: 0.03, to: 0.86, count: n0 - 2, shape: shape === "blade" ? "blade" : "soft" },
    { len: 0.22, width: 0.32, from: 0.04, to: 0.8, count: n0 + 4, shape: "scale" },
  ] as const;
  const midpoints: Pt[][] = [];

  layerSpecs.slice(0, layerCount).forEach((spec, layer) => {
    const pts: Pt[] = [];
    const items: string[] = [];
    for (let i = 0; i < spec.count; i++) {
      const t = lerp(spec.to, spec.from, spec.count === 1 ? 0 : i / (spec.count - 1)); // tip first
      const b = g.bone(t);
      const a = g.angle(t) + (rnd() - 0.5) * 4 + layer * 2;
      const L = g.length(t) * spec.len * (0.96 + rnd() * 0.08);
      const w = L * spec.width;
      const li = langIndexAt(1 - t);
      const prism = has("prism") && layer === 0 ? ` stroke="url(#prism)" stroke-width="1.6"` : ` stroke="${shade(langs[li].color, 0.6)}" stroke-width=".6"`;
      let feather = `<path d="${featherPath(spec.shape, L, w)}" fill="url(#g${li}_${layer})"${prism} stroke-opacity=".8"/>`;
      if (layer < 2 && spec.shape !== "blade") {
        feather += `<path d="M2 0Q${f(L * 0.5)} ${f(-w * 0.12)} ${f(L * 0.93)} ${f(-w * 0.05)}" stroke="${tint(langs[li].color, 0.7)}" stroke-width="1" fill="none" opacity=".55"/>`;
        let barbs = "";
        for (let k = 1; k <= 3; k++) {
          const x = L * (0.3 + k * 0.15);
          barbs += `M${f(x)} ${f(-w * 0.05)}L${f(x + L * 0.07)} ${f(-w * 0.6)}M${f(x)} ${f(0)}L${f(x + L * 0.06)} ${f(w * 0.5)}`;
        }
        feather += `<path d="${barbs}" stroke="${shade(langs[li].color, 0.5)}" stroke-width=".7" opacity=".35"/>`;
      }
      items.push(`<g transform="translate(${f(b.x)} ${f(b.y)}) rotate(${f(a)})">${feather}</g>`);
      const ar = (a * Math.PI) / 180;
      pts.push({ x: b.x + Math.cos(ar) * L * 0.55, y: b.y + Math.sin(ar) * L * 0.55 });
    }
    midpoints.push(pts);
    wing.push(`<g class="layer">${items.join("")}</g>`);
  });

  // Bone / leading edge
  const bonePts = Array.from({ length: 24 }, (_, i) => g.bone(i / 23));
  const boneD = "M" + bonePts.map((p) => `${f(p.x)} ${f(p.y)}`).join("L");
  wing.push(
    `<path d="${boneD}" stroke="${shade(tier.metal, 0.5)}" stroke-width="${f(7 + 4 * starPower)}" stroke-linecap="round" fill="none"/>`,
    `<path d="${boneD}" stroke="url(#metal)" stroke-width="${f(4.5 + 3 * starPower)}" stroke-linecap="round" fill="none"/>`,
  );

  if (has("hex")) wing.push(hexPlates(g, tier));
  if (has("runes")) wing.push(runes(g, tier, rnd));
  if (has("neural")) wing.push(neural(midpoints, rnd));

  defs.push(`<g id="wing">${wing.join("")}</g>`);

  // ── Scene ──
  const scene: string[] = [];
  const back: string[] = [];
  const front: string[] = [];
  const top = cy - span * 0.62;

  if (has("constellation")) back.push(constellation(cx, cy, span, rnd));
  if (has("aurora")) back.push(aurora(cx, cy, span, langs));
  if (stats.stars >= 1000) back.push(halo(cx, top - 4, tier, starPower));

  const sides = [
    { sign: 1, badges: langs.slice(0, 6).map(langBadge) },
    { sign: -1, badges: stats.tech.slice(0, 6).map(techBadge) },
  ];
  for (const side of sides) {
    const mirror = side.sign < 0 ? " scale(-1 1)" : "";
    const glow = stats.stars >= 50 ? `<use href="#wing" filter="url(#glow)" opacity="${f(0.25 + 0.35 * starPower)}"/>` : "";
    const badgeR = 13;
    const slots = side.badges.length;
    const badges = side.badges
      .map((b, i) => {
        const t = slots === 1 ? 0.55 : lerp(0.86, 0.14, i / (slots - 1));
        const p = along(g, t, layerCount >= 2 ? 0.62 : 0.85, 0.55);
        return `<g transform="translate(${f(p.x)} ${f(p.y)})${mirror}">${b(badgeR, tier)}</g>`;
      })
      .join("");
    scene.push(
      `<g transform="translate(${f(cx + side.sign * gap)} ${cy})${mirror}"><g class="flap">${glow}<use href="#wing"/>${badges}</g></g>`,
    );
  }

  scene.push(heart(cx, cy + 8, langs, tier, stats));

  if (has("ember")) front.push(embers(cx, cy, span, gap, rnd));
  if (has("pixel")) front.push(pixels(cx, cy, span, langs, rnd));
  if (has("crystal")) front.push(crystals(cx, cy, span, rnd));
  front.push(sparkles(cx, cy, span, stats.stars, tier, rnd));

  // ── Label ──
  const wingBottom = cy + span * 0.48;
  const labelY = wingBottom + 34;
  const label = showLabel ? renderLabel(stats, tier, langs, opts.title, labelY, W) : null;
  const height = label ? labelY + 74 + (label.rows - 1) * 20 : wingBottom + 30;

  const style = `
    .t1{font:700 22px 'Segoe UI',Ubuntu,'Helvetica Neue',sans-serif;fill:var(--fg)}
    .t2{font:500 13px 'Segoe UI',Ubuntu,'Helvetica Neue',sans-serif;fill:var(--muted)}
    .t3{font:500 12px 'Segoe UI',Ubuntu,'Helvetica Neue',sans-serif;fill:var(--muted)}
    svg{--fg:${theme === "dark" ? "#e6edf3" : "#1f2328"};--muted:${theme === "dark" ? "#9198a1" : "#59636e"};--card:${theme === "dark" ? "#0d1117" : "#ffffff"}}
    ${theme === "auto" ? "@media (prefers-color-scheme:dark){svg{--fg:#e6edf3;--muted:#9198a1;--card:#0d1117}}" : ""}
    a{cursor:pointer}
    ${
      animate
        ? `.flap{transform-origin:0 0;animation:flap 4.6s ease-in-out infinite}
    @keyframes flap{0%,100%{transform:rotate(5deg)}50%{transform:rotate(-9deg)}}
    .bob{animation:bob 4.6s ease-in-out infinite}
    @keyframes bob{0%,100%{transform:translateY(3px)}50%{transform:translateY(-4px)}}
    .tw{animation:tw 2.8s ease-in-out infinite}
    @keyframes tw{0%,100%{opacity:.15}50%{opacity:1}}
    .px{animation:px 1.6s steps(2) infinite}
    @keyframes px{0%{opacity:0}100%{opacity:1}}
    .rise{animation:rise 3.2s ease-in infinite}
    @keyframes rise{0%{transform:translateY(0);opacity:0}15%{opacity:1}100%{transform:translateY(-70px);opacity:0}}
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
  const desc = `${stats.subject}: ${tier.name} wings — ${stats.stars} stars, ${stats.commits} commits; ${langs.map((l) => l.name).join(", ")}${stats.tech.length ? "; " + stats.tech.map((t) => t.label).join(", ") : ""}`;

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${W} ${f(height)}" width="${W}" height="${f(height)}" role="img" aria-label="${esc(desc)}">` +
    `<title>${esc(desc)}</title><style>${style}</style><defs>${defs.join("")}</defs>${bg}` +
    `<g class="bob">${back.join("")}${scene.join("")}${front.join("")}</g>${label?.svg ?? ""}` +
    `<!-- traits: ${traits.join(", ") || "none"} · shape: ${shape} · layers: ${layerCount} · feathers: ${n0} -->` +
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
  const parts = name.replace(/[^A-Za-z0-9+# ]/g, " ").trim().split(/\s+/);
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
    y: cy - span * 0.2 - rnd() * span * 0.75,
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
  langs: LanguageStat[],
  title: string | undefined,
  y: number,
  W: number,
): { svg: string; rows: number } {
  const name = title ?? stats.subject;
  const parts = [
    `${tier.name} wings`,
    `★ ${formatCount(stats.stars)}`,
    `${formatCount(stats.commits)} commits`,
    stats.kind === "user" ? `${stats.repos} repos` : `${formatCount(stats.forks)} forks`,
    `${stats.tech.length} technologies`,
  ];

  // Legend: languages (dot + %) then frameworks; links on each item. Wraps onto up to LEGEND_ROWS rows.
  const charW = 7;
  const maxW = W - 48;
  const rows: { items: string[]; w: number }[] = [{ items: [], w: 0 }];
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
  for (const l of langs) {
    const text = `${l.name} ${(l.share * 100).toFixed(0)}%`;
    const fits = place(
      12 + text.length * charW + 14,
      (x) =>
        `<a href="${esc(l.url)}" xlink:href="${esc(l.url)}" target="_blank"><circle cx="${f(x + 4)}" cy="-4" r="4" fill="${l.color}"/><text class="t3" x="${f(x + 12)}">${esc(text)}</text></a>`,
    );
    if (!fits) break;
  }
  for (const t of stats.tech) {
    const fits = place(
      (t.label.length + 2) * charW + 18,
      (x) => `<a href="${esc(t.url)}" xlink:href="${esc(t.url)}" target="_blank"><text class="t3" x="${f(x)}">◆ ${esc(t.label)}</text></a>`,
    );
    if (!fits) break;
  }
  const legend = rows
    .map((row, i) => `<g transform="translate(${f(W / 2 - row.w / 2)} ${f(y + 48 + i * 20)})">${row.items.join("")}</g>`)
    .join("");

  return {
    svg:
      `<g text-anchor="middle"><a href="${esc(stats.url)}" xlink:href="${esc(stats.url)}" target="_blank"><text class="t1" x="${W / 2}" y="${f(y)}">${esc(name)}</text></a>` +
      `<text class="t2" x="${W / 2}" y="${f(y + 22)}">${esc(parts.join("  ·  "))}</text></g>` +
      legend,
    rows: rows.length,
  };
}
