#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { parseArgs } from "node:util";
import { fetchStats, readmeSnippet, renderWings, type WingStats } from "./index.js";

const HELP = `gitwings — gorgeous SVG wings from a GitHub repository or profile

Usage:
  gitwings <owner/repo | repo-url | username> [options]
  gitwings --stats stats.json [options]

Options:
  -o, --output <file>    Write the SVG here (default: stdout)
      --theme <t>        auto | dark | light  (default: auto)
      --background       Draw a card background
      --no-label         Wings only, no title/stats/legend
      --no-animate       Static SVG
      --title <text>     Custom title
      --stats <file>     Render from a stats JSON instead of the API (offline)
      --json <file>      Also save the collected stats as JSON
      --dark-output <f>  Also write a dark-theme variant (use with --theme light)
      --snippet <url>    Print a README snippet that embeds the image from <url>
      --snippet-dark <u> Dark variant URL for the snippet (<picture>, follows GitHub theme)
  -h, --help

Env: GITHUB_TOKEN or GH_TOKEN raises the API rate limit (60 → 5000 req/h).`;

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      output: { type: "string", short: "o" },
      theme: { type: "string", default: "auto" },
      background: { type: "boolean", default: false },
      "no-label": { type: "boolean", default: false },
      "no-animate": { type: "boolean", default: false },
      title: { type: "string" },
      stats: { type: "string" },
      json: { type: "string" },
      snippet: { type: "string" },
      "snippet-dark": { type: "string" },
      "dark-output": { type: "string" },
      help: { type: "boolean", short: "h" },
    },
  });

  if (values.help || (!positionals[0] && !values.stats)) {
    console.log(HELP);
    process.exit(values.help ? 0 : 1);
  }
  if (!["auto", "dark", "light"].includes(values.theme!)) throw new Error(`--theme must be auto, dark or light`);

  const stats: WingStats = values.stats
    ? JSON.parse(await readFile(values.stats, "utf8"))
    : await fetchStats(positionals[0]);

  const render = (theme: "auto" | "dark" | "light") =>
    renderWings(stats, {
      theme,
      background: values.background,
      label: !values["no-label"],
      animate: !values["no-animate"],
      title: values.title,
    });
  const svg = render(values.theme as "auto" | "dark" | "light");
  if (values["dark-output"]) await save(values["dark-output"], render("dark"));

  if (values.json) await save(values.json, JSON.stringify(stats, null, 2));
  if (values.output) {
    await save(values.output, svg);
    console.error(`🪽  ${stats.subject}: ${stats.stars}★, ${stats.commits} commits, ` +
      `${stats.languages.map((l) => l.name).join("/") || "no languages"}` +
      `${stats.tech.length ? " + " + stats.tech.map((t) => t.label).join(", ") : ""} → ${values.output}`);
  } else if (!values.snippet) {
    process.stdout.write(svg);
  }
  if (values.snippet) console.log(readmeSnippet(stats, values.snippet, values["snippet-dark"]));
}

async function save(path: string, content: string) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, "utf8");
}

main().catch((e) => {
  console.error(`gitwings: ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
