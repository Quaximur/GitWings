// Tech-stack knowledge: which dependencies/files map to which technology,
// and which visual "trait" each technology adds to the wings.

export type Trait =
  | "aurora" // frontend: orbiting rings of light
  | "runes" // backend: glowing runes along the wing bone
  | "neural" // AI / ML: neural network woven through the feathers
  | "pixel" // gamedev: twinkling pixel sparks
  | "ember" // systems: rising embers & forged edges
  | "prism" // mobile: iridescent feather edges
  | "hex" // devops / infra: hexagonal armor scales
  | "constellation" // data: star map behind the wings
  | "crystal"; // web3: floating crystal shards

export interface TechDef {
  id: string;
  label: string;
  trait: Trait;
  /** Dependency names (lowercase). A trailing `*` means prefix match, a leading `*` suffix match. */
  deps?: string[];
  /** Regexes tested against repository file paths. */
  files?: RegExp[];
  /** Dropped when one of these is detected in the same repository: it comes with that scaffold. */
  impliedBy?: string[];
}

export const TECH: TechDef[] = [
  // ── Frontend ──────────────────────────────────────────────
  { id: "react", label: "React", trait: "aurora", deps: ["react", "react-dom"] },
  { id: "next", label: "Next.js", trait: "aurora", deps: ["next"], files: [/(^|\/)next\.config\.(js|mjs|ts)$/] },
  { id: "vue", label: "Vue", trait: "aurora", deps: ["vue"] },
  { id: "nuxt", label: "Nuxt", trait: "aurora", deps: ["nuxt", "nuxt3"] },
  { id: "angular", label: "Angular", trait: "aurora", deps: ["@angular/core"], files: [/(^|\/)angular\.json$/] },
  { id: "svelte", label: "Svelte", trait: "aurora", deps: ["svelte", "@sveltejs/kit"] },
  { id: "solid", label: "Solid", trait: "aurora", deps: ["solid-js"] },
  { id: "astro", label: "Astro", trait: "aurora", deps: ["astro"] },
  { id: "tailwind", label: "Tailwind", trait: "aurora", deps: ["tailwindcss"] },
  { id: "vite", label: "Vite", trait: "aurora", deps: ["vite"] },
  { id: "blazor", label: "Blazor", trait: "aurora", deps: ["microsoft.aspnetcore.components*"] },

  // ── Backend ───────────────────────────────────────────────
  { id: "express", label: "Express", trait: "runes", deps: ["express"] },
  { id: "nest", label: "NestJS", trait: "runes", deps: ["@nestjs/core"] },
  { id: "fastify", label: "Fastify", trait: "runes", deps: ["fastify"] },
  { id: "django", label: "Django", trait: "runes", deps: ["django"] },
  { id: "flask", label: "Flask", trait: "runes", deps: ["flask"] },
  { id: "fastapi", label: "FastAPI", trait: "runes", deps: ["fastapi"] },
  { id: "spring", label: "Spring", trait: "runes", deps: ["org.springframework*", "spring-boot*"] },
  { id: "rails", label: "Rails", trait: "runes", deps: ["rails"] },
  { id: "laravel", label: "Laravel", trait: "runes", deps: ["laravel/framework"] },
  { id: "aspnet", label: "ASP.NET", trait: "runes", deps: ["microsoft.aspnetcore*", "sdk:microsoft.net.sdk.web"] },
  { id: "efcore", label: "EF Core", trait: "runes", deps: ["microsoft.entityframeworkcore*"] },
  { id: "magiconion", label: "MagicOnion", trait: "runes", deps: ["magiconion*", "com.cysharp.magiconion*"] },
  { id: "grpc", label: "gRPC", trait: "runes", deps: ["grpc*", "@grpc/*", "google.golang.org/grpc", "tonic", "magiconion*"] },
  { id: "gin", label: "Gin", trait: "runes", deps: ["github.com/gin-gonic/gin"] },
  { id: "fiber", label: "Fiber", trait: "runes", deps: ["github.com/gofiber/fiber*"] },
  { id: "actix", label: "Actix", trait: "runes", deps: ["actix-web"] },
  { id: "axum", label: "Axum", trait: "runes", deps: ["axum"] },
  { id: "phoenix", label: "Phoenix", trait: "runes", deps: ["phoenix"] },

  // ── AI / ML ───────────────────────────────────────────────
  { id: "pytorch", label: "PyTorch", trait: "neural", deps: ["torch", "pytorch-lightning", "lightning"] },
  { id: "tensorflow", label: "TensorFlow", trait: "neural", deps: ["tensorflow", "tensorflow-gpu", "@tensorflow/tfjs", "keras"] },
  { id: "jax", label: "JAX", trait: "neural", deps: ["jax", "flax"] },
  { id: "transformers", label: "Transformers", trait: "neural", deps: ["transformers", "diffusers", "@huggingface/*"] },
  { id: "sklearn", label: "scikit-learn", trait: "neural", deps: ["scikit-learn", "sklearn", "xgboost", "lightgbm"] },
  { id: "langchain", label: "LangChain", trait: "neural", deps: ["langchain*", "@langchain/*", "llama-index*", "llama_index"] },
  { id: "anthropic", label: "Claude API", trait: "neural", deps: ["anthropic", "@anthropic-ai/*", "anthropic.sdk"] },
  { id: "openai", label: "OpenAI", trait: "neural", deps: ["openai"] },
  { id: "mcp", label: "MCP", trait: "neural", deps: ["@modelcontextprotocol/*", "mcp", "fastmcp"] },
  { id: "mlagents", label: "ML-Agents", trait: "neural", deps: ["com.unity.ml-agents", "mlagents"] },
  { id: "onnx", label: "ONNX", trait: "neural", deps: ["onnx", "onnxruntime*", "microsoft.ml.onnxruntime*"] },

  // ── Gamedev ───────────────────────────────────────────────
  { id: "unity", label: "Unity", trait: "pixel", files: [/(^|\/)ProjectSettings\/ProjectVersion\.txt$/, /(^|\/)Packages\/manifest\.json$/, /\.unity$/] },
  { id: "godot", label: "Godot", trait: "pixel", files: [/(^|\/)project\.godot$/] },
  { id: "unreal", label: "Unreal", trait: "pixel", files: [/\.uproject$/] },
  { id: "bevy", label: "Bevy", trait: "pixel", deps: ["bevy"] },
  { id: "pygame", label: "Pygame", trait: "pixel", deps: ["pygame"] },
  { id: "three", label: "Three.js", trait: "pixel", deps: ["three", "@react-three/fiber"] },
  { id: "phaser", label: "Phaser", trait: "pixel", deps: ["phaser"] },
  { id: "monogame", label: "MonoGame", trait: "pixel", deps: ["monogame*"] },
  { id: "love2d", label: "LÖVE", trait: "pixel", files: [/(^|\/)conf\.lua$/] },

  // ── Mobile ────────────────────────────────────────────────
  { id: "flutter", label: "Flutter", trait: "prism", deps: ["flutter"] },
  { id: "reactnative", label: "React Native", trait: "prism", deps: ["react-native", "expo"] },
  { id: "android", label: "Android", trait: "prism", files: [/(^|\/)AndroidManifest\.xml$/] },
  { id: "ios", label: "iOS", trait: "prism", files: [/\.xcodeproj\//, /(^|\/)Podfile$/] },
  { id: "maui", label: ".NET MAUI", trait: "prism", deps: ["microsoft.maui*"] },
  { id: "compose", label: "Compose", trait: "prism", deps: ["androidx.compose*"] },

  // ── DevOps / Infra ────────────────────────────────────────
  { id: "docker", label: "Docker", trait: "hex", files: [/(^|\/)Dockerfile$/, /(^|\/)docker-compose\.ya?ml$/, /(^|\/)compose\.ya?ml$/] },
  { id: "kubernetes", label: "Kubernetes", trait: "hex", files: [/(^|\/)Chart\.yaml$/, /(^|\/)(k8s|kubernetes|helm)\//] },
  { id: "terraform", label: "Terraform", trait: "hex", files: [/\.tf$/] },
  { id: "actions", label: "GH Actions", trait: "hex", files: [/^\.github\/workflows\/.+\.ya?ml$/] },
  { id: "testcontainers", label: "Testcontainers", trait: "hex", deps: ["testcontainers*", "@testcontainers/*", "org.testcontainers*"] },
  { id: "xunit", label: "xUnit", trait: "hex", deps: ["xunit*"] },
  { id: "nix", label: "Nix", trait: "hex", files: [/(^|\/)flake\.nix$/, /(^|\/)default\.nix$/] },

  // ── Data ──────────────────────────────────────────────────
  { id: "pandas", label: "pandas", trait: "constellation", deps: ["pandas", "polars"] },
  { id: "numpy", label: "NumPy", trait: "constellation", deps: ["numpy", "scipy"] },
  { id: "spark", label: "Spark", trait: "constellation", deps: ["pyspark", "org.apache.spark*"] },
  { id: "jupyter", label: "Jupyter", trait: "constellation", deps: ["jupyter", "notebook", "jupyterlab"], files: [/\.ipynb$/] },
  { id: "d3", label: "D3", trait: "constellation", deps: ["d3"] },
  { id: "postgres", label: "PostgreSQL", trait: "constellation", deps: ["pg", "psycopg*", "npgsql*", "asyncpg", "github.com/jackc/pgx*"] },
  { id: "redis", label: "Redis", trait: "constellation", deps: ["redis", "ioredis", "stackexchange.redis*", "*.redis", "github.com/redis/go-redis*", "spring-boot-starter-data-redis"] },
  { id: "prisma", label: "Prisma", trait: "constellation", deps: ["prisma", "@prisma/client"] },

  // ── Web3 ──────────────────────────────────────────────────
  { id: "ethers", label: "Ethers", trait: "crystal", deps: ["ethers", "web3", "viem", "wagmi"] },
  { id: "hardhat", label: "Hardhat", trait: "crystal", deps: ["hardhat"], files: [/(^|\/)foundry\.toml$/] },
  { id: "solana", label: "Solana", trait: "crystal", deps: ["@solana/web3.js", "anchor-lang", "solana-program"] },

  // ── Reactive / misc, folded into the closest aura ─────────
  { id: "rxjs", label: "RxJS", trait: "aurora", deps: ["rxjs"], impliedBy: ["nest", "angular"] },
  { id: "r3", label: "R3", trait: "aurora", deps: ["r3", "com.cysharp.r3"] },
  { id: "vcontainer", label: "VContainer", trait: "runes", deps: ["jp.hadashikick.vcontainer"] },
  { id: "reflex", label: "Reflex", trait: "runes", deps: ["com.gustavopsantos.reflex"] },
  { id: "unitask", label: "UniTask", trait: "pixel", deps: ["com.cysharp.unitask", "unitask"] },
];

/** Languages whose dominance changes the feather shape. */
export const SHAPE_BY_LANGUAGE: Record<string, FeatherShape> = {
  Rust: "blade", C: "blade", "C++": "blade", Go: "blade", Zig: "blade", Assembly: "blade", Nim: "blade",
  Haskell: "flowing", Elixir: "flowing", Clojure: "flowing", OCaml: "flowing", Elm: "flowing",
  "F#": "flowing", Scala: "flowing", Lisp: "flowing", Erlang: "flowing", Julia: "flowing",
};

/** Languages that by themselves imply a trait (e.g. systems → embers). */
export const TRAIT_BY_LANGUAGE: Record<string, Trait> = {
  Rust: "ember", C: "ember", "C++": "ember", Zig: "ember", Assembly: "ember", Go: "ember",
  "Jupyter Notebook": "constellation", R: "constellation",
  Solidity: "crystal", Move: "crystal",
  Dart: "prism", Swift: "prism", Kotlin: "prism",
  HCL: "hex", Dockerfile: "hex", Nix: "hex",
  ShaderLab: "pixel", HLSL: "pixel", GLSL: "pixel", GDScript: "pixel",
  Vue: "aurora", Svelte: "aurora", Astro: "aurora",
};

export type FeatherShape = "soft" | "blade" | "flowing";

function depMatches(dep: string, pattern: string): boolean {
  if (pattern.endsWith("*")) return dep.startsWith(pattern.slice(0, -1));
  if (pattern.startsWith("*")) return dep.endsWith(pattern.slice(1));
  return dep === pattern;
}

/** Match collected dependency names and file paths against the registry. */
export function detectTech(deps: Iterable<string>, paths: Iterable<string>): TechDef[] {
  const depList = [...new Set([...deps].map((d) => d.toLowerCase()))];
  const pathList = [...paths];
  const found = TECH.filter(
    (t) =>
      t.deps?.some((p) => depList.some((d) => depMatches(d, p))) ||
      t.files?.some((re) => pathList.some((path) => re.test(path))),
  );
  const ids = new Set(found.map((t) => t.id));
  return found.filter((t) => !t.impliedBy?.some((id) => ids.has(id)));
}

/** Linguist colors for common languages (fallback: hashed hue). */
export const LANGUAGE_COLORS: Record<string, string> = {
  TypeScript: "#3178c6", JavaScript: "#f1e05a", Python: "#3572A5", Java: "#b07219", "C#": "#178600",
  "C++": "#f34b7d", C: "#555555", Go: "#00ADD8", Rust: "#dea584", Ruby: "#701516", PHP: "#4F5D95",
  Swift: "#F05138", Kotlin: "#A97BFF", Dart: "#00B4AB", Scala: "#c22d40", Haskell: "#5e5086",
  Elixir: "#6e4a7e", Erlang: "#B83998", Clojure: "#db5855", OCaml: "#ef7a08", "F#": "#b845fc",
  Lua: "#000080", Perl: "#0298c3", R: "#198CE7", Julia: "#a270ba", Shell: "#89e051",
  PowerShell: "#012456", HTML: "#e34c26", CSS: "#663399", SCSS: "#c6538c", Vue: "#41b883",
  Svelte: "#ff3e00", Astro: "#ff5a03", "Jupyter Notebook": "#DA5B0B", Zig: "#ec915c", Nim: "#ffc200",
  Solidity: "#AA6746", ShaderLab: "#222c37", HLSL: "#aace60", GLSL: "#5686a5", GDScript: "#355570",
  Dockerfile: "#384d54", HCL: "#844FBA", Nix: "#7e7eff", Makefile: "#427819", CMake: "#DA3434",
  "Objective-C": "#438eff", Assembly: "#6E4C13", Elm: "#60B5CC", MDX: "#fcb32c", Markdown: "#083fa1",
  "Vim Script": "#199f4b", "Emacs Lisp": "#c065db", TeX: "#3D6117", Groovy: "#4298b8", Batchfile: "#C1F12E",
};

/** Icon (simple-icons slug) and reference URL for each technology. */
export const TECH_META: Record<string, [icon: string | null, url: string]> = {
  grpc: [null, "https://grpc.io"], magiconion: [null, "https://github.com/Cysharp/MagicOnion"],
  redis: ["redis", "https://redis.io"], testcontainers: [null, "https://testcontainers.com"], xunit: [null, "https://xunit.net"],
  reflex: [null, "https://github.com/gustavopsantos/Reflex"], unitask: [null, "https://github.com/Cysharp/UniTask"], react: ["react", "https://react.dev"], next: ["nextdotjs", "https://nextjs.org"], vue: ["vuedotjs", "https://vuejs.org"],
  nuxt: ["nuxt", "https://nuxt.com"], angular: ["angular", "https://angular.dev"], svelte: ["svelte", "https://svelte.dev"],
  solid: ["solid", "https://www.solidjs.com"], astro: ["astro", "https://astro.build"], tailwind: ["tailwindcss", "https://tailwindcss.com"],
  vite: ["vite", "https://vite.dev"], blazor: ["blazor", "https://dotnet.microsoft.com/apps/aspnet/web-apps/blazor"],
  express: ["express", "https://expressjs.com"], nest: ["nestjs", "https://nestjs.com"], fastify: ["fastify", "https://fastify.dev"],
  django: ["django", "https://www.djangoproject.com"], flask: ["flask", "https://flask.palletsprojects.com"],
  fastapi: ["fastapi", "https://fastapi.tiangolo.com"], spring: ["spring", "https://spring.io"],
  rails: ["rubyonrails", "https://rubyonrails.org"], laravel: ["laravel", "https://laravel.com"],
  aspnet: ["dotnet", "https://dotnet.microsoft.com/apps/aspnet"], efcore: ["dotnet", "https://learn.microsoft.com/ef/core"],
  gin: ["gin", "https://gin-gonic.com"], fiber: ["go", "https://gofiber.io"],
  actix: ["actix", "https://actix.rs"], axum: ["rust", "https://github.com/tokio-rs/axum"],
  phoenix: ["phoenixframework", "https://www.phoenixframework.org"],
  pytorch: ["pytorch", "https://pytorch.org"], tensorflow: ["tensorflow", "https://www.tensorflow.org"],
  jax: [null, "https://github.com/jax-ml/jax"], transformers: ["huggingface", "https://huggingface.co/docs/transformers"],
  sklearn: ["scikitlearn", "https://scikit-learn.org"], langchain: ["langchain", "https://www.langchain.com"],
  anthropic: ["claude", "https://docs.anthropic.com"], openai: [null, "https://platform.openai.com"],
  mcp: ["modelcontextprotocol", "https://modelcontextprotocol.io"], mlagents: ["unity", "https://github.com/Unity-Technologies/ml-agents"],
  onnx: ["onnx", "https://onnx.ai"],
  unity: ["unity", "https://unity.com"], godot: ["godotengine", "https://godotengine.org"], unreal: ["unrealengine", "https://www.unrealengine.com"],
  bevy: ["bevy", "https://bevyengine.org"], pygame: [null, "https://www.pygame.org"], three: ["threedotjs", "https://threejs.org"],
  phaser: [null, "https://phaser.io"], monogame: [null, "https://monogame.net"], love2d: [null, "https://love2d.org"],
  flutter: ["flutter", "https://flutter.dev"], reactnative: ["react", "https://reactnative.dev"], android: ["android", "https://developer.android.com"],
  ios: ["apple", "https://developer.apple.com/ios"], maui: ["dotnet", "https://dotnet.microsoft.com/apps/maui"],
  compose: ["jetpackcompose", "https://developer.android.com/compose"],
  docker: ["docker", "https://www.docker.com"], kubernetes: ["kubernetes", "https://kubernetes.io"],
  terraform: ["terraform", "https://www.terraform.io"], actions: ["githubactions", "https://github.com/features/actions"],
  nix: ["nixos", "https://nixos.org"],
  pandas: ["pandas", "https://pandas.pydata.org"], numpy: ["numpy", "https://numpy.org"], spark: ["apachespark", "https://spark.apache.org"],
  jupyter: ["jupyter", "https://jupyter.org"], d3: ["d3", "https://d3js.org"], postgres: ["postgresql", "https://www.postgresql.org"],
  prisma: ["prisma", "https://www.prisma.io"],
  ethers: ["ethereum", "https://docs.ethers.org"], hardhat: [null, "https://hardhat.org"], solana: ["solana", "https://solana.com"],
  rxjs: ["reactivex", "https://rxjs.dev"], r3: ["reactivex", "https://github.com/Cysharp/R3"],
  vcontainer: [null, "https://vcontainer.hadashikick.jp"],
};

/** Icon and reference URL for languages. */
export const LANGUAGE_META: Record<string, [icon: string | null, url: string]> = {
  TypeScript: ["typescript", "https://www.typescriptlang.org"], JavaScript: ["javascript", "https://developer.mozilla.org/docs/Web/JavaScript"],
  Python: ["python", "https://www.python.org"], Java: ["openjdk", "https://openjdk.org"], "C#": ["dotnet", "https://learn.microsoft.com/dotnet/csharp"],
  "C++": ["cplusplus", "https://isocpp.org"], C: ["c", "https://en.cppreference.com/w/c"], Go: ["go", "https://go.dev"],
  Rust: ["rust", "https://www.rust-lang.org"], Ruby: ["ruby", "https://www.ruby-lang.org"], PHP: ["php", "https://www.php.net"],
  Swift: ["swift", "https://www.swift.org"], Kotlin: ["kotlin", "https://kotlinlang.org"], Dart: ["dart", "https://dart.dev"],
  Scala: ["scala", "https://www.scala-lang.org"], Haskell: ["haskell", "https://www.haskell.org"], Elixir: ["elixir", "https://elixir-lang.org"],
  Erlang: ["erlang", "https://www.erlang.org"], Clojure: ["clojure", "https://clojure.org"], OCaml: ["ocaml", "https://ocaml.org"],
  "F#": ["fsharp", "https://fsharp.org"], Lua: ["lua", "https://www.lua.org"], Perl: ["perl", "https://www.perl.org"],
  R: ["r", "https://www.r-project.org"], Julia: ["julia", "https://julialang.org"], Shell: ["gnubash", "https://www.gnu.org/software/bash"],
  PowerShell: [null, "https://learn.microsoft.com/powershell"], HTML: ["html5", "https://developer.mozilla.org/docs/Web/HTML"],
  CSS: ["css", "https://developer.mozilla.org/docs/Web/CSS"], SCSS: ["sass", "https://sass-lang.com"], Vue: ["vuedotjs", "https://vuejs.org"],
  Svelte: ["svelte", "https://svelte.dev"], Astro: ["astro", "https://astro.build"], "Jupyter Notebook": ["jupyter", "https://jupyter.org"],
  Zig: ["zig", "https://ziglang.org"], Nim: ["nim", "https://nim-lang.org"], Solidity: ["solidity", "https://soliditylang.org"],
  ShaderLab: ["unity", "https://docs.unity3d.com/Manual/SL-Reference.html"], GLSL: ["opengl", "https://www.khronos.org/opengl"],
  HLSL: [null, "https://learn.microsoft.com/windows/win32/direct3dhlsl"], GDScript: ["godotengine", "https://docs.godotengine.org"],
  Dockerfile: ["docker", "https://docs.docker.com/reference/dockerfile"], HCL: ["terraform", "https://github.com/hashicorp/hcl"],
  Nix: ["nixos", "https://nixos.org"], CMake: ["cmake", "https://cmake.org"], Markdown: ["markdown", "https://commonmark.org"],
  MDX: ["mdx", "https://mdxjs.com"], "Vim Script": ["vim", "https://www.vim.org"],
};
