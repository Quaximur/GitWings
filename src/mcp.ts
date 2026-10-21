#!/usr/bin/env node
// MCP server: lets AI assistants (Claude Code, Claude Desktop, Cursor, …) generate wings.

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { fetchStats, genomeFor, readmeSnippet, renderWings, tierFor, toLanguageStats, toTechStats, TECH, type WingStats } from "./index.js";

const server = new McpServer({ name: "gitwings", version: "0.1.0" });

const renderShape = {
  theme: z.enum(["auto", "dark", "light"]).optional().describe("Text colors; auto follows the viewer's color scheme"),
  background: z.boolean().optional().describe("Draw a card background (default: transparent)"),
  label: z.boolean().optional().describe("Show title, stats and legend under the wings (default: true)"),
  animate: z.boolean().optional().describe("Animated flapping, sparkles and particles (default: true)"),
  credit: z.boolean().optional().describe('A small "grown with Quaximur/GitWings" link under the label (default: true)'),
  seed: z.string().optional().describe("Grow the wings from this name instead of the subject: every name has its own quirk (wing genes, colors, sigil)"),
  output_path: z.string().optional().describe("If set, the SVG is written to this file and only a summary is returned"),
  image_url: z.string().optional().describe("Public URL the SVG will be served from; returns a README snippet for it"),
};

type RenderArgs = { theme?: "auto" | "dark" | "light"; background?: boolean; label?: boolean; animate?: boolean; credit?: boolean; seed?: string; output_path?: string; image_url?: string };

async function respond(stats: WingStats, args: RenderArgs) {
  const svg = renderWings(stats, args);
  const tier = tierFor(stats.stars);
  const gen = genomeFor(args.seed ?? stats.subject);
  const summary = [
    `${stats.subject}: ${tier.name} wings — quirk “${gen.quirk}” (${gen.primaries} primaries, ${gen.coverts} coverts, ${gen.trail} trail, ${gen.bone} bone, ${gen.echoes} echo pairs)`,
    `stars ${stats.stars}, commits ${stats.commits}${stats.contributions !== undefined ? `, contributions ${stats.contributions}` : ""}, forks ${stats.forks}`,
    `languages: ${stats.languages.map((l) => `${l.name} ${(l.share * 100).toFixed(1)}%`).join(", ") || "—"}`,
    `tech: ${stats.tech.map((t) => `${t.label} (${t.trait}${t.repos ? `, ${t.repos} repos` : ""})`).join(", ") || "—"}`,
    stats.kind === "user" ? `repositories analysed: ${stats.repos}` : "",
  ];
  if (args.output_path) {
    const path = resolve(args.output_path);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, svg, "utf8");
    summary.push(`saved: ${path} (${svg.length} bytes)`);
  }
  if (args.image_url) summary.push("", "README snippet:", readmeSnippet(stats, args.image_url));
  const content = [{ type: "text" as const, text: summary.join("\n") }];
  if (!args.output_path) content.push({ type: "text" as const, text: svg });
  return { content };
}

server.registerTool(
  "generate_wings",
  {
    title: "Generate GitHub wings",
    description:
      "Generate animated SVG wings that show a developer's skills. Given a username, ALL of their repositories are " +
      "analysed: languages are weighted by how much the user committed to each repo, frameworks are ranked by how many " +
      "repos use them. Given owner/repo, only that repository is used. Commits shape feathers and layers, stars set " +
      "wingspan, tier and glow, languages color the feathers, frameworks add visual traits and linked icon badges.",
    inputSchema: {
      target: z.string().describe("A GitHub username (profile skills) or owner/repo / repo URL (single repository)"),
      include_forks: z.boolean().optional().describe("Profile: also analyse forks"),
      include_private: z.boolean().optional().describe("Profile: also analyse private repos (token must belong to the user)"),
      max_repos: z.number().int().positive().optional().describe("Profile: analyse at most N most recently pushed repos"),
      ...renderShape,
    },
    annotations: { readOnlyHint: false, openWorldHint: true },
  },
  async ({ target, include_forks, include_private, max_repos, ...args }) =>
    respond(await fetchStats(target, { includeForks: include_forks, includePrivate: include_private, maxRepos: max_repos }), args),
);

server.registerTool(
  "render_wings_from_stats",
  {
    title: "Render wings from custom stats",
    description:
      "Render wings without calling GitHub — e.g. for a private project, a mockup, or to preview how wings evolve. " +
      `Tech ids: ${TECH.map((t) => t.id).join(", ")}.`,
    inputSchema: {
      subject: z.string().describe("Title, e.g. owner/repo"),
      url: z.string().optional(),
      stars: z.number().int().min(0),
      commits: z.number().int().min(0),
      forks: z.number().int().min(0).optional(),
      languages: z.record(z.string(), z.number()).describe('Language → bytes or share, e.g. {"TypeScript": 70, "CSS": 30}'),
      tech: z.array(z.string()).optional().describe("Tech ids from the list above"),
      ...renderShape,
    },
    annotations: { readOnlyHint: false, openWorldHint: false },
  },
  async ({ subject, url, stars, commits, forks, languages, tech, ...args }) => {
    const unknown = (tech ?? []).filter((id) => !TECH.some((t) => t.id === id));
    const stats: WingStats = {
      kind: "repo",
      subject,
      url: url ?? `https://github.com/${subject}`,
      stars,
      commits,
      forks: forks ?? 0,
      repos: 1,
      languages: toLanguageStats(languages),
      tech: toTechStats(TECH.filter((t) => tech?.includes(t.id))),
    };
    const result = await respond(stats, args);
    if (unknown.length) result.content[0].text += `\nignored unknown tech ids: ${unknown.join(", ")}`;
    return result;
  },
);

await server.connect(new StdioServerTransport());
