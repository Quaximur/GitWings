// The wing genome: everything about the wings that no statistic decides.
//
// It is hashed from the login (or owner/repo), so every account grows its own wings,
// like a quirk: the same name always gives the same wings, and the data only makes them grow.
// The wing is assembled from independent genes, so they combine into tens of thousands of kinds:
//
//   primaries → the outer layer: feathers, crystal shards, a draconic membrane or spectral ribbons
//   coverts   → the inner layers: feathers, shards, scales, or nothing over a membrane / ribbons
//   trail     → what hangs behind: nothing, ghostly ribbons or long phoenix streamers
//   bone      → the leading edge: forged metal, a spectral glow, or metal with thorns
//   echoes    → extra smaller pairs (three pairs make a seraph)
//   feather, marking, motes, sigil, hue, pose, tempo → the details that make two similar pairs differ
//   quirk     → the name of that particular pair, e.g. "Umbral Ashdrake" or "Seraph of the Ninth Moon"

export type Primaries = "feathers" | "shards" | "membrane" | "ribbons";
export type Coverts = "feathers" | "shards" | "scales" | "none";
export type Trail = "none" | "ribbons" | "streamers";
export type Bone = "metal" | "spectral" | "thorned";
export type FeatherStyle = "soft" | "plume" | "sickle" | "flame";
export type Marking = "eyes" | "bands" | "speckle" | "veil" | "none";
export type Motes = "fireflies" | "ash" | "sparks" | "dust";
export type SigilFrame = "rings" | "hexagon" | "triangle" | "square";

/** Bump to reshuffle every genome. Picked so that the author's own login keeps its six-winged seraph. */
const SALT = "genome-v2:281619";

export interface Sigil {
  frame: SigilFrame;
  /** Points of the star polygon {points/step}. */
  points: number;
  step: number;
  /** Tick lengths around the outer ring, 0..1. */
  ticks: number[];
  /** Glyph kinds placed around the circle. */
  glyphs: number[];
  /** Small orbiting moons. */
  moons: number;
}

export interface Genome {
  seed: string;
  primaries: Primaries;
  coverts: Coverts;
  trail: Trail;
  bone: Bone;
  /** Extra smaller pairs of wings. */
  echoes: 0 | 1 | 2;
  feather: FeatherStyle;
  marking: Marking;
  motes: Motes;
  /** What the wings are called, from their structure, e.g. "Seraph", "Wyrm", "Wraith". */
  kind: string;
  quirk: string;
  hue: number;
  /** Accent for dark backgrounds and its deep variant for light ones. */
  accent: string;
  accentDeep: string;
  /** -1..1: how high the arm is raised. */
  lift: number;
  /** 0..1: how far the wing sweeps outwards. */
  sweep: number;
  /** 0..1: how strongly the feathers fan towards the tip. */
  fan: number;
  /** Membrane: fingers spanning it. */
  fingers: number;
  /** Seconds per wingbeat and the beat amplitude in degrees (up, down). */
  tempo: number;
  beat: [number, number];
  sigil: Sigil;
}

export function seededRandom(seed: string): () => number {
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

const NOUNS: Record<string, string[]> = {
  seraph: ["Seraph", "Archon", "Ophan", "Thronewing"],
  angel: ["Thronewing", "Aureole", "Choirwing", "Herald", "Warden", "Paladin"],
  phoenix: ["Phoenix", "Firebird", "Simurgh", "Pyrewing"],
  shards: ["Geode", "Prism", "Obsidian", "Facet", "Quartz Warden", "Shardwing"],
  membrane: ["Wyrm", "Drake", "Wyvern", "Basilisk", "Nightwyrm", "Ashdrake"],
  ribbons: ["Wraith", "Specter", "Revenant", "Shade", "Wisp", "Phantom"],
};
const EPITHETS = [
  "Umbral", "Gilded", "Hollow", "Silent", "Ashen", "Vesper", "Eclipsed", "Frostbound", "Starborn", "Sable",
  "Crimson", "Abyssal", "Lucent", "Feral", "Arcane", "Wandering", "Veiled", "Thousand-Eyed", "Dreaming", "Iron",
  "Storm-Born", "Grim", "Sunken", "Burning", "Nameless", "Obsidian",
];
const DOMAINS = [
  "of the Ninth Moon", "of Quiet Storms", "of Forgotten Code", "of the Last Commit", "of Hollow Stars", "of the Deep Stack",
  "of Null", "of the Undertow", "of Distant Bells", "of Unwritten Names", "of the Long Night", "of Soft Static",
  "of the Iron Gate", "of Ash and Ember", "of the Silent Core",
];

const pick = <T>(rnd: () => number, list: readonly T[]): T => list[Math.floor(rnd() * list.length)];

/** What a combination of genes is called. */
function kindOf(primaries: Primaries, trail: Trail, echoes: number): keyof typeof NOUNS {
  if (primaries === "ribbons") return "ribbons";
  if (primaries === "membrane") return "membrane";
  if (primaries === "shards") return "shards";
  if (echoes === 2) return "seraph";
  return trail === "streamers" ? "phoenix" : "angel";
}

/** Derives the genome from a name. Case-insensitive, so @Login and @login share their wings. */
export function genomeFor(name: string): Genome {
  const seed = name.trim().toLowerCase();
  const rnd = seededRandom(SALT + seed);

  const primaries = pick(rnd, ["feathers", "feathers", "shards", "membrane", "ribbons"] as const);
  const coverts =
    primaries === "membrane" || primaries === "ribbons"
      ? pick(rnd, ["feathers", "shards", "scales", "none", "none"] as const)
      : pick(rnd, ["feathers", "feathers", "shards", "scales"] as const);
  const trail = pick(rnd, ["none", "none", "ribbons", "streamers"] as const);
  const bone = pick(rnd, ["metal", "metal", "spectral", "thorned"] as const);
  const echoes = rnd() < 0.35 ? (rnd() < 0.55 ? 2 : 1) : 0;
  const kind = kindOf(primaries, trail, echoes);

  const noun = pick(rnd, NOUNS[kind]);
  const form = rnd();
  const quirk =
    form < 0.45 ? `${pick(rnd, EPITHETS)} ${noun}` : form < 0.85 ? `${noun} ${pick(rnd, DOMAINS)}` : `${pick(rnd, EPITHETS)} ${noun} ${pick(rnd, DOMAINS)}`;

  const hue = Math.floor(rnd() * 360);
  const points = 5 + Math.floor(rnd() * 5); // 5..9
  const steps = Array.from({ length: Math.floor((points - 1) / 2) }, (_, i) => i + 1).filter((s) => s > 1 || points < 6);
  const sigil: Sigil = {
    frame: pick(rnd, ["rings", "rings", "hexagon", "triangle", "square"] as const),
    points,
    step: pick(rnd, steps.length ? steps : [2]),
    ticks: Array.from({ length: 48 + Math.floor(rnd() * 4) * 12 }, () => rnd()),
    glyphs: Array.from({ length: 6 + Math.floor(rnd() * 7) }, () => Math.floor(rnd() * 8)),
    moons: 1 + Math.floor(rnd() * 3),
  };

  const ghostly = primaries === "ribbons" || bone === "spectral";
  return {
    seed,
    primaries,
    coverts,
    trail,
    bone,
    echoes,
    feather: pick(rnd, ["soft", "plume", "sickle", "flame"] as const),
    marking: pick(rnd, ["eyes", "bands", "speckle", "veil", "none"] as const),
    motes: pick(rnd, ["fireflies", "ash", "sparks", "dust"] as const),
    kind: noun,
    quirk,
    hue,
    accent: `hsl(${hue} ${70 + Math.floor(rnd() * 25)}% ${68 + Math.floor(rnd() * 10)}%)`,
    accentDeep: `hsl(${hue} 70% 38%)`,
    lift: rnd() * 2 - 1,
    sweep: rnd(),
    fan: rnd(),
    fingers: 3 + Math.floor(rnd() * 3),
    tempo: ghostly ? 5.5 + rnd() * 2 : 4 + rnd() * 1.6,
    beat: [3 + rnd() * 4, 6 + rnd() * 6],
    sigil,
  };
}
