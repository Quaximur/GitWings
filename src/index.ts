import { fetchRepoStats, fetchUserStats, GitHubClient, type ProfileOptions, type WingStats } from "./github.js";
import { activityOf, formatCount, GITWINGS_URL, renderWings, tierFor, type RenderOptions } from "./wings.js";

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
 * links inside the picture unclickable, so every technology also gets a real link below it.
 */
export function readmeSnippet(stats: WingStats, imageUrl: string, darkImageUrl?: string): string {
  const tier = tierFor(stats.stars);
  const activity = activityOf(stats);
  const links = [
    ...stats.languages.map((l) => `<a href="${l.url}">${l.name}</a>`),
    ...stats.tech.map((t) => `<a href="${t.url}">${t.label}</a>`),
  ];
  const img = `<img src="${imageUrl}" alt="${tier.name} wings of ${stats.subject}" width="100%"/>`;
  // <picture> follows the GitHub theme, unlike prefers-color-scheme inside the SVG.
  const picture = darkImageUrl
    ? `<picture><source media="(prefers-color-scheme: dark)" srcset="${darkImageUrl}"/>` +
      `<source media="(prefers-color-scheme: light)" srcset="${imageUrl}"/>${img}</picture>`
    : img;
  return [
    `<p align="center">`,
    `  <a href="${stats.url}">${picture}</a>`,
    `</p>`,
    ``,
    `<p align="center"><sub>${tier.name} wings · ★ ${formatCount(stats.stars)} · ${formatCount(activity.count)} ${activity.noun} · ${links.join(" · ")}</sub></p>`,
    ``,
    `<p align="center"><sub>🪽 grown with <a href="${GITWINGS_URL}">GitWings</a></sub></p>`,
  ].join("\n");
}
