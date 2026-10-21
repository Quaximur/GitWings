import { fetchRepoStats, fetchUserStats, GitHubClient, type ProfileOptions, type WingStats } from "./github.js";
import { getIcon } from "./icons.js";
import { GITWINGS_URL, renderWings, tierFor, type RenderOptions } from "./wings.js";

export * from "./github.js";
export * from "./wings.js";
export { TECH, type Trait } from "./tech.js";
export { genomeFor, type Genome } from "./genome.js";

/** A login → profile wings (skills across all repositories); "owner/repo" or a repo URL → one repository. */
export async function fetchStats(target: string, opts: ProfileOptions & { token?: string } = {}): Promise<WingStats> {
  const gh = new GitHubClient(opts.token);
  const t = target.trim().replace(/^@/, "").replace(/^https?:\/\/github\.com\/([^/]+)\/?$/, "$1");
  return t.includes("/") ? fetchRepoStats(t, gh) : fetchUserStats(t, gh, opts);
}

export async function generateWings(target: string, opts: RenderOptions & ProfileOptions & { token?: string } = {}) {
  const stats = await fetchStats(target, opts);
  return { stats, svg: renderWings(stats, opts) };
}

/**
 * Markdown for a profile README. GitHub shows SVGs through <img>, which makes
 * links inside the picture unclickable, so the snippet drops the legend and the credit
 * from the picture (render it with `snippetRenderOptions`) and lists them below as real links.
 */
export function readmeSnippet(stats: WingStats, imageUrl: string, darkImageUrl?: string): string {
  const tier = tierFor(stats.stars);
  const img = `<img src="${imageUrl}" alt="${tier.name} wings of ${stats.subject}" width="100%"/>`;
  // <picture> follows the GitHub theme, unlike prefers-color-scheme inside the SVG.
  const picture = darkImageUrl
    ? `<picture><source media="(prefers-color-scheme: dark)" srcset="${darkImageUrl}"/>` +
      `<source media="(prefers-color-scheme: light)" srcset="${imageUrl}"/>${img}</picture>`
    : img;
  const row = (badges: string[]) => (badges.length ? [`<p align="center">`, ...badges.map((b) => `  ${b}`), `</p>`, ``] : []);
  return [
    `<p align="center">`,
    `  <a href="${stats.url}">${picture}</a>`,
    `</p>`,
    ``,
    ...row(stats.languages.map((l) => badge(l.url, l.name, l.icon, l.color, `${(l.share * 100).toFixed(0)}%`))),
    ...row(stats.tech.map((t) => badge(t.url, t.label, t.icon, getIcon(t.icon)?.hex ?? "#6e7681"))),
    `<p align="center"><sub>🪽 grown with <a href="${GITWINGS_URL}">Quaximur/GitWings</a></sub></p>`,
  ].join("\n");
}

/** Render options for the picture in `readmeSnippet`: what the snippet links to is left out of the SVG. */
export const snippetRenderOptions = { legend: false, credit: false } as const;

/**
 * A shields.io badge linking to `url`: a dark plate with the logo in its brand colour, so it reads on
 * both GitHub themes. With `value` (a language share), the value sits on the right in `color`.
 */
function badge(url: string, name: string, icon: string | null, color: string, value?: string): string {
  // shields.io path segments: "-" and "_" are separators, so they are doubled.
  const part = (text: string) => encodeURIComponent(text.replace(/-/g, "--").replace(/_/g, "__"));
  const hex = color.replace("#", "");
  const path = value ? `${part(name)}-${part(value)}-${hex}` : `${part(name)}-${PLATE}`;
  const query = new URLSearchParams({ style: "flat-square", labelColor: PLATE });
  if (icon) {
    query.set("logo", icon);
    // Dark brands (black, .NET purple) would vanish on the plate.
    query.set("logoColor", luminance(hex) < 0.3 ? "white" : hex);
  }
  const alt = value ? `${name} ${value}` : name;
  return `<a href="${url}"><img src="https://img.shields.io/badge/${path}?${query}" alt="${alt}"/></a>`;
}

const PLATE = "21262d";

function luminance(hex: string): number {
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export const README_START = "<!-- gitwings:start -->";
export const README_END = "<!-- gitwings:end -->";

/** Replaces everything between the gitwings markers in a README, so a workflow can keep the links in step with the wings. */
export function updateReadme(readme: string, snippet: string): string {
  const start = readme.indexOf(README_START);
  const end = readme.indexOf(README_END, start);
  if (start < 0 || end < 0) throw new Error(`the README has no ${README_START} … ${README_END} markers`);
  return readme.slice(0, start + README_START.length) + "\n" + snippet + "\n" + readme.slice(end);
}
