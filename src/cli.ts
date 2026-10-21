#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { parseArgs } from "node:util";
import { activityOf, fetchStats, readmeSnippet, renderWings, snippetRenderOptions, updateReadme, type WingStats } from "./index.js";

const HELP = `gitwings — gorgeous SVG wings that show a developer's skills

Usage:
  gitwings <username>               wings from ALL of the user's repositories
  gitwings <owner/repo | repo-url>  wings for a single repository
  gitwings --stats stats.json       render from saved stats (offline)

Profile options:
      --include-forks    Also analyse forked repositories
      --include-private  Also analyse private repositories (token of that user, repo scope)
      --max-repos <n>    Analyse at most n most recently pushed repositories

Options:
  -o, --output <file>    Write the SVG here (default: stdout)
      --theme <t>        auto | dark | light  (default: auto)
      --background       Draw a card background
      --no-label         Wings only, no title/stats/legend
      --no-animate       Static SVG
      --no-credit        No "grown with Quaximur/GitWings" link under the label
      --title <text>     Custom title
      --seed <name>      Grow the wings of another name (each name has its own quirk)
      --stats <file>     Render from a stats JSON instead of the API (offline)
      --json <file>      Also save the collected stats as JSON
      --dark-output <f>  Also write a dark-theme variant (use with --theme light)
      --snippet <url>    Print a README snippet that embeds the image from <url>
      --snippet-dark <u> Dark variant URL for the snippet (<picture>, follows GitHub theme)
      --readme <file>    Put the snippet between <!-- gitwings:start --> and <!-- gitwings:end -->
                         in this file instead of printing it (needs --snippet)
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
      "no-credit": { type: "boolean", default: false },
      title: { type: "string" },
      seed: { type: "string" },
      stats: { type: "string" },
      json: { type: "string" },
      snippet: { type: "string" },
      "snippet-dark": { type: "string" },
      readme: { type: "string" },
      "dark-output": { type: "string" },
      "include-forks": { type: "boolean", default: false },
      "include-private": { type: "boolean", default: false },
      "max-repos": { type: "string" },
      quiet: { type: "boolean", short: "q", default: false },
      help: { type: "boolean", short: "h" },
    },
  });

  if (values.help || (!positionals[0] && !values.stats)) {
    console.log(HELP);
    process.exit(values.help ? 0 : 1);
  }
  if (!["auto", "dark", "light"].includes(values.theme!)) throw new Error(`--theme must be auto, dark or light`);
  if (values.readme && !values.snippet) throw new Error(`--readme needs --snippet <image url>`);

  const stats: WingStats = values.stats
    ? JSON.parse(await readFile(values.stats, "utf8"))
    : await fetchStats(positionals[0], {
        includeForks: values["include-forks"],
        includePrivate: values["include-private"],
        maxRepos: values["max-repos"] ? Number(values["max-repos"]) : undefined,
        onProgress: values.quiet ? undefined : (m) => console.error(m),
      });

  const render = (theme: "auto" | "dark" | "light") =>
    renderWings(stats, {
      theme,
      background: values.background,
      label: !values["no-label"],
      animate: !values["no-animate"],
      title: values.title,
      seed: values.seed,
      credit: !values["no-credit"],
      // The snippet lists languages, technologies and the credit as real links under the picture.
      ...(values.snippet ? snippetRenderOptions : {}),
    });
  const svg = render(values.theme as "auto" | "dark" | "light");
  if (values["dark-output"]) await save(values["dark-output"], render("dark"));

  if (values.json) await save(values.json, JSON.stringify(stats, null, 2));
  if (values.output) {
    await save(values.output, svg);
    console.error(`🪽  ${stats.subject}: ${stats.stars}★, ${activityOf(stats).count} ${activityOf(stats).noun}, ` +
      `${stats.languages.map((l) => l.name).join("/") || "no languages"}` +
      `${stats.tech.length ? " + " + stats.tech.map((t) => t.label).join(", ") : ""} → ${values.output}`);
  } else if (!values.snippet) {
    process.stdout.write(svg);
  }
  if (values.snippet) {
    const snippet = readmeSnippet(stats, values.snippet, values["snippet-dark"]);
    if (values.readme) {
      await writeFile(values.readme, updateReadme(await readFile(values.readme, "utf8"), snippet), "utf8");
      if (!values.quiet) console.error(`🪽  links refreshed in ${values.readme}`);
    } else {
      console.log(snippet);
    }
  }
}

async function save(path: string, content: string) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, "utf8");
}

main().catch((e) => {
  console.error(`gitwings: ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
