// Collects everything the wings depend on from the GitHub REST API.

import { detectTech, LANGUAGE_COLORS, LANGUAGE_META, TECH_META, type TechDef } from "./tech.js";

export interface LanguageStat {
  name: string;
  share: number; // 0..1
  color: string;
  icon: string | null;
  url: string;
}

export interface TechStat {
  id: string;
  label: string;
  trait: TechDef["trait"];
  icon: string | null;
  url: string;
}

export interface WingStats {
  kind: "repo" | "user";
  /** "owner/repo" or "user". */
  subject: string;
  url: string;
  stars: number;
  forks: number;
  commits: number;
  /** Number of public repositories (user mode) or 1. */
  repos: number;
  languages: LanguageStat[];
  tech: TechStat[];
}

const API = "https://api.github.com";
const MANIFESTS = new Set([
  "package.json", "requirements.txt", "requirements-dev.txt", "pyproject.toml", "Pipfile", "setup.py",
  "Cargo.toml", "go.mod", "Gemfile", "composer.json", "pubspec.yaml", "pom.xml", "build.gradle",
  "build.gradle.kts", "mix.exs", "manifest.json", "Directory.Packages.props",
]);
const SKIP_DIRS = /(^|\/)(node_modules|vendor|third_party|examples?|samples?|test|tests|fixtures|Library|\.yarn)\//;
const MAX_MANIFESTS = 14;

export class GitHubClient {
  constructor(private token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN) {}

  private headers(): Record<string, string> {
    const h: Record<string, string> = { Accept: "application/vnd.github+json", "User-Agent": "gitwings" };
    if (this.token) h.Authorization = `Bearer ${this.token}`;
    return h;
  }

  async request<T>(path: string): Promise<{ data: T; link: string | null }> {
    const res = await fetch(path.startsWith("http") ? path : API + path, { headers: this.headers() });
    if (!res.ok) {
      const remaining = res.headers.get("x-ratelimit-remaining");
      const hint = remaining === "0" ? " (rate limit exceeded — set GITHUB_TOKEN)" : "";
      throw new Error(`GitHub ${res.status} for ${path}${hint}`);
    }
    return { data: (await res.json()) as T, link: res.headers.get("link") };
  }

  async raw(owner: string, repo: string, ref: string, path: string): Promise<string | null> {
    const url = `https://raw.githubusercontent.com/${owner}/${repo}/${encodeURIComponent(ref)}/${path.split("/").map(encodeURIComponent).join("/")}`;
    const res = await fetch(url, { headers: this.token ? { Authorization: `Bearer ${this.token}` } : {} });
    return res.ok ? res.text() : null;
  }
}

// ─── Public entry points ──────────────────────────────────────────────

export async function fetchRepoStats(fullName: string, gh = new GitHubClient()): Promise<WingStats> {
  const [owner, repo] = parseRepo(fullName);
  const { data: info } = await gh.request<RepoInfo>(`/repos/${owner}/${repo}`);
  const [commits, langBytes, scan] = await Promise.all([
    countCommits(gh, owner, repo, info.default_branch),
    gh.request<Record<string, number>>(`/repos/${owner}/${repo}/languages`).then((r) => r.data),
    scanStack(gh, owner, repo, info.default_branch),
  ]);
  return {
    kind: "repo",
    subject: info.full_name,
    url: info.html_url,
    stars: info.stargazers_count,
    forks: info.forks_count,
    commits,
    repos: 1,
    languages: toLanguageStats(langBytes),
    tech: toTechStats(detectTech(scan.deps, scan.paths)),
  };
}

export async function fetchUserStats(user: string, gh = new GitHubClient(), deepScan = 6): Promise<WingStats> {
  const { data: profile } = await gh.request<{ login: string; html_url: string; public_repos: number }>(`/users/${user}`);
  const repos = await listRepos(gh, profile.login);
  const own = repos.filter((r) => !r.fork && !r.archived);
  const ranked = [...own].sort(
    (a, b) => b.stargazers_count - a.stargazers_count || Date.parse(b.pushed_at) - Date.parse(a.pushed_at),
  );

  const langBytes: Record<string, number> = {};
  const langTargets = ranked.slice(0, 12);
  const langResults = await Promise.all(
    langTargets.map((r) => gh.request<Record<string, number>>(`/repos/${r.full_name}/languages`).then((x) => x.data).catch(() => ({}))),
  );
  for (const bytes of langResults) for (const [k, v] of Object.entries(bytes)) langBytes[k] = (langBytes[k] ?? 0) + v;

  const deps = new Set<string>();
  const paths = new Set<string>();
  const scans = await Promise.all(
    ranked.slice(0, deepScan).map((r) => scanStack(gh, profile.login, r.name, r.default_branch).catch(() => null)),
  );
  for (const s of scans) {
    s?.deps.forEach((d) => deps.add(d));
    s?.paths.forEach((p) => paths.add(p));
  }

  const commits = await gh
    .request<{ total_count: number }>(`/search/commits?q=author:${profile.login}&per_page=1`)
    .then((r) => r.data.total_count)
    .catch(async () => {
      const counts = await Promise.all(ranked.slice(0, 10).map((r) => countCommits(gh, profile.login, r.name, r.default_branch)));
      return counts.reduce((a, b) => a + b, 0);
    });

  return {
    kind: "user",
    subject: profile.login,
    url: profile.html_url,
    stars: own.reduce((s, r) => s + r.stargazers_count, 0),
    forks: own.reduce((s, r) => s + r.forks_count, 0),
    commits,
    repos: profile.public_repos,
    languages: toLanguageStats(langBytes),
    tech: toTechStats(detectTech(deps, paths)),
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────

interface RepoInfo {
  name: string;
  full_name: string;
  html_url: string;
  default_branch: string;
  stargazers_count: number;
  forks_count: number;
  fork: boolean;
  archived: boolean;
  pushed_at: string;
}

export function parseRepo(input: string): [string, string] {
  const m = input.trim().replace(/\.git$/, "").match(/(?:github\.com[/:])?([\w.-]+)\/([\w.-]+)\/?$/);
  if (!m) throw new Error(`Not a repository: "${input}" (expected owner/repo or a GitHub URL)`);
  return [m[1], m[2]];
}

async function listRepos(gh: GitHubClient, user: string): Promise<RepoInfo[]> {
  const all: RepoInfo[] = [];
  for (let page = 1; page <= 3; page++) {
    const { data } = await gh.request<RepoInfo[]>(`/users/${user}/repos?per_page=100&type=owner&sort=pushed&page=${page}`);
    all.push(...data);
    if (data.length < 100) break;
  }
  return all;
}

async function countCommits(gh: GitHubClient, owner: string, repo: string, branch: string): Promise<number> {
  try {
    const { data, link } = await gh.request<unknown[]>(`/repos/${owner}/${repo}/commits?sha=${encodeURIComponent(branch)}&per_page=1`);
    const last = link?.match(/[?&]page=(\d+)>;\s*rel="last"/);
    return last ? Number(last[1]) : data.length;
  } catch {
    return 0; // empty repositories answer 409
  }
}

/** Walks the repository tree, then reads dependency manifests to find frameworks. */
async function scanStack(gh: GitHubClient, owner: string, repo: string, branch: string) {
  const deps = new Set<string>();
  let paths: string[] = [];
  try {
    const { data } = await gh.request<{ tree: { path: string; type: string }[] }>(
      `/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
    );
    paths = data.tree.filter((t) => t.type === "blob").map((t) => t.path);
  } catch {
    return { deps, paths };
  }

  const manifests = paths
    .filter((p) => !SKIP_DIRS.test(p) && p.split("/").length <= 4)
    .filter((p) => MANIFESTS.has(basename(p)) || /\.(csproj|fsproj)$/.test(p))
    .filter((p) => basename(p) !== "manifest.json" || p.endsWith("Packages/manifest.json"))
    .sort((a, b) => a.split("/").length - b.split("/").length)
    .slice(0, MAX_MANIFESTS);

  const contents = await Promise.all(manifests.map((p) => gh.raw(owner, repo, branch, p)));
  manifests.forEach((p, i) => {
    const text = contents[i];
    if (text) for (const d of parseManifest(basename(p), text)) deps.add(d.toLowerCase());
  });
  return { deps, paths };
}

function basename(p: string): string {
  return p.slice(p.lastIndexOf("/") + 1);
}

/** Extracts dependency names from a manifest. Deliberately forgiving, never throws. */
export function parseManifest(file: string, text: string): string[] {
  const out: string[] = [];
  const grab = (re: RegExp, group = 1) => {
    for (const m of text.matchAll(re)) out.push(m[group]);
  };
  try {
    if (file === "package.json" || file === "composer.json" || file === "manifest.json") {
      const j = JSON.parse(text);
      for (const key of ["dependencies", "devDependencies", "peerDependencies", "require", "require-dev"]) {
        if (j[key]) out.push(...Object.keys(j[key]));
      }
    } else if (file.startsWith("requirements") || file === "Pipfile") {
      grab(/^\s*([A-Za-z0-9_.-]+)/gm);
    } else if (file === "pyproject.toml" || file === "setup.py") {
      grab(/["']([A-Za-z0-9_.-]+)\s*(?:[<>=~!;\[][^"']*)?["']/g);
      grab(/^\s*([A-Za-z0-9_.-]+)\s*=\s*["{]/gm);
    } else if (file === "Cargo.toml") {
      grab(/^\s*([A-Za-z0-9_-]+)\s*=/gm);
    } else if (file === "go.mod") {
      grab(/^\s*(?:require\s+)?([\w.-]+\.[\w]+\/[\w./-]+)\s+v/gm);
    } else if (file === "Gemfile") {
      grab(/^\s*gem\s+["']([^"']+)["']/gm);
    } else if (file === "pubspec.yaml") {
      grab(/^\s{2}([a-z0-9_]+):/gm);
      if (/^\s*flutter:/m.test(text)) out.push("flutter");
    } else if (file === "pom.xml") {
      grab(/<groupId>([^<]+)<\/groupId>/g);
      grab(/<artifactId>([^<]+)<\/artifactId>/g);
    } else if (file.startsWith("build.gradle")) {
      grab(/["']([\w.-]+):([\w.-]+)(?::[^"']*)?["']/g);
      grab(/["']([\w.-]+):([\w.-]+)(?::[^"']*)?["']/g, 2);
    } else if (file === "mix.exs") {
      grab(/\{:(\w+),/g);
    } else if (/\.(csproj|fsproj)$/.test(file) || file === "Directory.Packages.props") {
      grab(/<Package(?:Reference|Version)\s+Include="([^"]+)"/g);
      const sdk = text.match(/<Project\s+Sdk="([^"]+)"/);
      if (sdk) out.push(`sdk:${sdk[1]}`);
    }
  } catch {
    /* malformed manifest — ignore */
  }
  return out;
}

function hashColor(name: string): string {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return `hsl(${h % 360} 65% 55%)`;
}

const IGNORED_LANGUAGES = new Set(["Makefile", "Batchfile", "Roff", "Procfile", "Smarty"]);

export function toLanguageStats(bytes: Record<string, number>, max = 6): LanguageStat[] {
  const entries = Object.entries(bytes).filter(([k, v]) => v > 0 && !IGNORED_LANGUAGES.has(k));
  const total = entries.reduce((s, [, v]) => s + v, 0) || 1;
  return entries
    .sort((a, b) => b[1] - a[1])
    .filter(([, v], i) => i === 0 || v / total >= 0.015)
    .slice(0, max)
    .map(([name, v]) => {
      const [icon, url] = LANGUAGE_META[name] ?? [null, `https://github.com/topics/${encodeURIComponent(name.toLowerCase())}`];
      return { name, share: v / total, color: LANGUAGE_COLORS[name] ?? hashColor(name), icon, url };
    });
}

export function toTechStats(defs: TechDef[]): TechStat[] {
  return defs.map((t) => {
    const [icon, url] = TECH_META[t.id] ?? [null, `https://github.com/topics/${t.id}`];
    return { id: t.id, label: t.label, trait: t.trait, icon, url };
  });
}
