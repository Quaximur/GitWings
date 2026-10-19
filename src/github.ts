// Collects everything the wings depend on from the GitHub REST API.

import { detectTech, LANGUAGE_COLORS, LANGUAGE_META, TECH_META, type TechDef } from "./tech.js";

export interface LanguageStat {
  name: string;
  share: number; // 0..1
  color: string;
  icon: string | null;
  url: string;
  /** Profile mode: repositories that use the language. */
  repos?: number;
}

export interface TechStat {
  id: string;
  label: string;
  trait: TechDef["trait"];
  icon: string | null;
  url: string;
  /** Profile mode: repositories that use the technology. */
  repos?: number;
}

export interface WingStats {
  kind: "repo" | "user";
  /** "owner/repo" or "user". */
  subject: string;
  url: string;
  stars: number;
  forks: number;
  commits: number;
  /** Repositories analysed (profile mode) or 1. */
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

  get authenticated(): boolean {
    return !!this.token;
  }

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

  /** GraphQL needs a token; throws when unauthenticated or on any query error. */
  async graphql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
    if (!this.token) throw new Error("GitHub GraphQL needs a token");
    const res = await fetch(`${API}/graphql`, {
      method: "POST",
      headers: { ...this.headers(), "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables }),
    });
    if (!res.ok) throw new Error(`GitHub GraphQL ${res.status}`);
    const body = (await res.json()) as { data?: T; errors?: { message: string }[] };
    if (!body.data) throw new Error(`GitHub GraphQL: ${body.errors?.[0]?.message ?? "no data"}`);
    return body.data;
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

export interface ProfileOptions {
  /** Include forked repositories. Default false. */
  includeForks?: boolean;
  /** Include private repositories (needs a token of that user with repo scope). Default false. */
  includePrivate?: boolean;
  /** Analyse at most this many repositories (most recently pushed first). Default: all with a token, 15 without. */
  maxRepos?: number;
  /** Called with progress messages. */
  onProgress?: (message: string) => void;
}

/**
 * Profile wings describe the person's skills: every repository they own is analysed.
 * Each repository counts by how much the user worked on it (their commits), not by its size,
 * so one huge vendored project does not drown out everything else.
 */
export async function fetchUserStats(user: string, gh = new GitHubClient(), opts: ProfileOptions = {}): Promise<WingStats> {
  const log = opts.onProgress ?? (() => {});
  const { data: profile } = await gh.request<UserInfo>(`/users/${user}`);
  const all = await listRepos(gh, profile.login, !!opts.includePrivate);
  const candidates = all
    .filter((r) => r.owner.login.toLowerCase() === profile.login.toLowerCase())
    .filter((r) => (opts.includeForks || !r.fork) && r.size > 0)
    .sort((a, b) => Date.parse(b.pushed_at) - Date.parse(a.pushed_at));
  const limit = opts.maxRepos ?? (gh.authenticated ? Infinity : 15);
  const repos = candidates.slice(0, limit);
  if (repos.length < candidates.length) {
    log(`analysing ${repos.length} of ${candidates.length} repositories${gh.authenticated ? "" : " — set GITHUB_TOKEN to analyse all"}`);
  } else {
    log(`analysing ${repos.length} repositories`);
  }

  const commitCounts = await countUserCommits(gh, profile, repos);
  let done = 0;
  const results = await mapPool(repos, gh.authenticated ? 8 : 4, async (r) => {
    const commits = commitCounts.get(r.full_name) ?? 0;
    const [langs, scan] = await Promise.all([
      gh.request<Record<string, number>>(`/repos/${r.full_name}/languages`).then((x) => x.data).catch(() => ({})),
      scanStack(gh, profile.login, r.name, r.default_branch).catch(() => null),
    ]);
    if (++done % 10 === 0 || done === repos.length) log(`  ${done}/${repos.length}`);
    return { repo: r, langs, commits, tech: scan ? detectTech(scan.deps, scan.paths) : [] };
  });

  // Language skill = Σ over repos of (language share in repo × repo weight).
  const langWeight: Record<string, number> = {};
  const langRepos: Record<string, number> = {};
  const techRepos = new Map<string, { def: TechDef; repos: number }>();
  for (const { langs, commits, tech } of results) {
    const total = Object.values(langs).reduce((a, b) => a + b, 0);
    const weight = 1 + Math.log2(1 + commits);
    if (total > 0) {
      for (const [name, bytes] of Object.entries(langs)) {
        const share = bytes / total;
        langWeight[name] = (langWeight[name] ?? 0) + share * weight;
        if (share >= 0.05) langRepos[name] = (langRepos[name] ?? 0) + 1;
      }
    }
    for (const def of tech) {
      const entry = techRepos.get(def.id) ?? { def, repos: 0 };
      entry.repos++;
      techRepos.set(def.id, entry);
    }
  }

  const commits = results.reduce((s, r) => s + r.commits, 0);
  const rankedTech = [...techRepos.values()].sort((a, b) => b.repos - a.repos);

  return {
    kind: "user",
    subject: profile.login,
    url: profile.html_url,
    stars: repos.reduce((s, r) => s + r.stargazers_count, 0),
    forks: repos.reduce((s, r) => s + r.forks_count, 0),
    commits,
    repos: repos.length,
    languages: toLanguageStats(langWeight, 8).map((l) => ({ ...l, repos: langRepos[l.name] ?? 1 })),
    tech: toTechStats(rankedTech.map((t) => t.def)).map((t, i) => ({ ...t, repos: rankedTech[i].repos })),
  };
}

async function mapPool<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
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
  size: number;
  private: boolean;
  owner: { login: string };
}

interface UserInfo {
  login: string;
  id: number;
  node_id: string;
  html_url: string;
}

export function parseRepo(input: string): [string, string] {
  const m = input.trim().replace(/\.git$/, "").match(/(?:github\.com[/:])?([\w.-]+)\/([\w.-]+)\/?$/);
  if (!m) throw new Error(`Not a repository: "${input}" (expected owner/repo or a GitHub URL)`);
  return [m[1], m[2]];
}

async function listRepos(gh: GitHubClient, user: string, includePrivate: boolean): Promise<RepoInfo[]> {
  let base = `/users/${user}/repos?type=owner`;
  if (includePrivate) {
    const me = await gh.request<{ login: string }>("/user").then((r) => r.data.login).catch(() => null);
    if (me?.toLowerCase() !== user.toLowerCase()) throw new Error("--include-private needs a token that belongs to " + user);
    base = "/user/repos?affiliation=owner&visibility=all";
  }
  const all: RepoInfo[] = [];
  for (let page = 1; page <= 20; page++) {
    const { data } = await gh.request<RepoInfo[]>(`${base}&per_page=100&sort=pushed&page=${page}`);
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

const GRAPHQL_BATCH = 20;
const REST_SAMPLE_PAGES = 5;

/**
 * The user's commits on each repository's default branch, keyed by full name.
 * Matching goes by account ID, not login: `?author=<login>` misses commits whose noreply
 * address still carries a login the account had before it was renamed.
 */
async function countUserCommits(gh: GitHubClient, user: UserInfo, repos: RepoInfo[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (gh.authenticated) {
    try {
      for (let i = 0; i < repos.length; i += GRAPHQL_BATCH) {
        const batch = repos.slice(i, i + GRAPHQL_BATCH);
        const fields = batch.map(
          (r, j) => `r${j}: repository(owner: ${JSON.stringify(r.owner.login)}, name: ${JSON.stringify(r.name)}) {
            defaultBranchRef { target { ... on Commit { history(author: { id: $id }) { totalCount } } } }
          }`,
        );
        type Repo = { defaultBranchRef: { target: { history?: { totalCount: number } } } | null } | null;
        const data = await gh.graphql<Record<string, Repo>>(`query($id: ID!) { ${fields.join(" ")} }`, { id: user.node_id });
        batch.forEach((r, j) => counts.set(r.full_name, data[`r${j}`]?.defaultBranchRef?.target.history?.totalCount ?? 0));
      }
      return counts;
    } catch {
      counts.clear(); // fall through to REST
    }
  }
  await mapPool(repos, gh.authenticated ? 8 : 4, async (r) => {
    counts.set(r.full_name, await countCommitsById(gh, r, user.id));
  });
  return counts;
}

/**
 * REST fallback: reads commit pages and keeps those GitHub attributes to the account ID.
 * Large histories are sampled, and the count is extrapolated from the sampled share.
 */
async function countCommitsById(gh: GitHubClient, r: RepoInfo, userId: number): Promise<number> {
  type Commit = { author: { id: number } | null };
  const base = `/repos/${r.full_name}/commits?sha=${encodeURIComponent(r.default_branch)}&per_page=100`;
  let mine = 0;
  let seen = 0;
  let lastPage = 1;
  try {
    for (let page = 1; page <= Math.min(lastPage, REST_SAMPLE_PAGES); page++) {
      const { data, link } = await gh.request<Commit[]>(`${base}&page=${page}`);
      if (page === 1) lastPage = Number(link?.match(/[?&]page=(\d+)>;\s*rel="last"/)?.[1] ?? 1);
      seen += data.length;
      mine += data.filter((c) => c.author?.id === userId).length;
    }
  } catch {
    return mine; // empty repositories answer 409
  }
  if (lastPage <= REST_SAMPLE_PAGES || seen === 0) return mine;
  // The last page holds 1..100 commits; assume it is half full.
  return Math.round((mine / seen) * ((lastPage - 1) * 100 + 50));
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
