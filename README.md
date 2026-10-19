# 🪽 GitWings

Анимированные SVG-крылья, которые описывают навыки разработчика.
GitWings анализирует **все репозитории пользователя**: языки, фреймворки, коммиты и звёзды. Готовые крылья вешаются на главную страницу GitHub-аккаунта.
Отдельная фича — крылья для **одного репозитория**.

<p align="center"><img src="examples/profile-neuecc.svg" width="100%"/></p>
<p align="center"><img src="examples/huggingface_transformers.svg" width="100%"/></p>
<p align="center"><img src="examples/tokio-rs_axum.svg" width="49%"/> <img src="examples/tiny.svg" width="49%"/></p>

Есть три способа использования:

| Режим | Для чего |
|---|---|
| **CLI** `gitwings` | вручную, локально |
| **MCP-сервер** `gitwings-mcp` | для AI-ассистентов: Claude Code, Claude Desktop, Cursor… |
| **GitHub Action** | ежедневное автообновление крыльев в профиле |

## Профиль: навыки по всем репозиториям

Если передать логин, анализируются все собственные репозитории (форки и пустые пропускаются):

- **Языки = навыки.** Каждый репозиторий даёт вклад *доля языка в репо × вес репо*, где вес = `1 + log2(1 + ваши коммиты в репо)`. Значит, важен объём вашей работы, а не размер кода: один огромный проект с вендорным кодом не перекрывает остальные.
- **Фреймворки** ранжируются по числу репозиториев, где они используются. Эмблемы показывают самые частые, а подсказка сообщает, например, «React · 7 repos».
- **Коммиты** — ваши коммиты (author = вы) во всех проанализированных репозиториях.
- **Звёзды** суммируются по вашим репозиториям.
- Флаги: `--include-forks`, `--include-private` (нужен токен этого пользователя со scope `repo`; на картинку попадают только агрегированные языки и технологии, названия репозиториев не выводятся), `--max-repos N`.

На каждый репозиторий уходит ~3 запроса к API. Без токена анализируются только 15 последних репозиториев, с `GITHUB_TOKEN` — все.

## Как данные превращаются в крылья

| Данные | Что меняется |
|---|---|
| **Коммиты** | количество перьев (7→19) и слоёв: маховые → вторичные (≥30) → кроющие (≥300) → чешуя-пух (≥2000) |
| **Звёзды** | размах крыльев, свечение, искры и **тир**, определяющий металл кости, гало и оправ эмблем: Fledgling (<10) · Rising (10+) · Soaring (100+) · Celestial (1k+, появляется гало) · Mythic (10k+) · Seraphic (50k+) |
| **Языки** | цвета перьев: секторы от кончика к телу по доле кода, linguist-цвета; «сердце» в центре — кольцевая диаграмма языков |
| **Семейство основного языка** | форма перьев: мягкие (по умолчанию), **клинки** (Rust, C/C++, Go, Zig), **струящиеся** (Haskell, Elixir, Scala, F#…) |
| **Фреймворки и библиотеки** | визуальные черты, см. таблицу ниже |

| Черта | Стек | Эффект |
|---|---|---|
| `aurora` | React, Vue, Angular, Svelte, Next, Tailwind, Blazor, RxJS/R3… | орбиты света с бегущими огоньками |
| `runes` | Express, Nest, Django, FastAPI, Spring, ASP.NET, gRPC, Axum… | светящиеся руны вдоль кости крыла |
| `neural` | PyTorch, TensorFlow, Transformers, LangChain, Claude API, MCP… | нейросеть, вплетённая в перья |
| `pixel` | Unity, Godot, Unreal, Bevy, Three.js, шейдеры… | мерцающие пиксели |
| `ember` | Rust, C, C++, Zig, Go | поднимающиеся угли |
| `prism` | Flutter, React Native, Swift, Kotlin, MAUI | радужная кромка маховых перьев |
| `hex` | Docker, Kubernetes, Terraform, GitHub Actions, Nix | гексагональные пластины-доспех |
| `constellation` | pandas, NumPy, Spark, Jupyter, PostgreSQL… | созвездие за крыльями |
| `crystal` | Ethers, Hardhat, Solana, Solidity | парящие кристаллы |

Фреймворки определяются по манифестам: `package.json`, `*.csproj`, `Cargo.toml`, `go.mod`, `pyproject.toml`, `requirements.txt`, `Gemfile`, `composer.json`, `pubspec.yaml`, `pom.xml`, `build.gradle`, `mix.exs`, Unity `Packages/manifest.json`. Учитываются и маркерные файлы: `Dockerfile`, `project.godot`, `ProjectSettings/`, `*.tf` и другие. Реестр находится в [src/tech.ts](src/tech.ts), новая технология добавляется одной строкой.

### Иконки и ссылки

На крыльях размещены эмблемы-медальоны с иконками ([simple-icons](https://simpleicons.org), CC0). На правом крыле — языки, на левом — фреймворки. У каждой эмблемы есть всплывающая подсказка и ссылка на сайт технологии; под крыльями — легенда, тоже со ссылками.

> ⚠️ В README GitHub показывает SVG через `<img>`, поэтому ссылки *внутри* картинки там не кликаются. Работают они, когда SVG открыт напрямую (по клику на картинку). Поэтому флаг `--snippet` дополнительно генерирует под картинкой HTML-строку с настоящими ссылками на каждую технологию.

### Почему SVG, а не шейдеры + GIF

GIF ограничен 256 цветами, поэтому градиенты и свечение в нём пойдут полосами. Весит он 2–10 МБ против ~50 КБ у SVG. Кроме того, для рендера нужен headless-браузер с WebGL в CI, где нет GPU. SVG чёткий на любом экране, а анимацию проигрывает браузер зрителя. Для пользователей с `prefers-reduced-motion` анимация отключается.

## Установка

```bash
git clone https://github.com/YOUR_NAME/GitWings && cd GitWings
npm install && npm run build
```

Без токена GitHub API даёт 60 запросов в час. Для профилей лучше задать `GITHUB_TOKEN` (подойдёт classic-токен без прав или fine-grained с доступом read-only).

## CLI

```bash
node dist/cli.js YOUR_LOGIN -o wings.svg --theme light --dark-output wings-dark.svg
```

```bash
node dist/cli.js facebook/react -o repo-wings.svg
```

```bash
node dist/cli.js --stats examples/tiny.json -o tiny.svg --background
```

Флаги: `--theme auto|dark|light`, `--background`, `--no-label`, `--no-animate`, `--title`, `--json stats.json`, `--snippet <url> [--snippet-dark <url>]`, `-q` (без прогресса) и профильные флаги, описанные выше.

## MCP-сервер (для AI)

Claude Code:

```bash
claude mcp add gitwings -e GITHUB_TOKEN=ghp_xxx -- node D:/path/to/GitWings/dist/mcp.js
```

Claude Desktop / Cursor (`mcpServers`):

```json
{
  "mcpServers": {
    "gitwings": {
      "command": "node",
      "args": ["/path/to/GitWings/dist/mcp.js"],
      "env": { "GITHUB_TOKEN": "ghp_xxx" }
    }
  }
}
```

Инструменты:
- **`generate_wings`** `{ target, include_forks?, include_private?, max_repos?, theme?, background?, label?, animate?, output_path?, image_url? }` — логин даёт крылья навыков по всем репозиториям, `owner/repo` — по одному репозиторию.
- **`render_wings_from_stats`** `{ subject, stars, commits, languages, tech?, … }` — без обращения к GitHub: для приватных проектов, мокапов и прогноза вида «какими станут крылья при 10k звёзд».

Пример запроса: *«Сгенерируй крылья для моего профиля и добавь их в README»*.

## Крылья на главной странице профиля

1. Создайте репозиторий `YOUR_LOGIN/YOUR_LOGIN`: его README GitHub показывает на странице профиля.
2. Скопируйте [examples/profile-workflow.yml](examples/profile-workflow.yml) в `.github/workflows/wings.yml` и замените `YOUR_NAME/GitWings` на свой форк этого репозитория.
   Встроенный `github.token` видит все публичные репозитории. Чтобы учесть приватные, создайте токен со scope `repo`, положите его в секрет `WINGS_TOKEN` и передайте `token: ${{ secrets.WINGS_TOKEN }}` и `options: --include-private`.
3. Запустите workflow вручную (Actions → Wings → Run workflow). SVG появятся в ветке `output`.
4. Добавьте в README:

```html
<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/YOUR_LOGIN/YOUR_LOGIN/output/wings-dark.svg"/>
    <img src="https://raw.githubusercontent.com/YOUR_LOGIN/YOUR_LOGIN/output/wings.svg" alt="My GitWings" width="100%"/>
  </picture>
</p>
```

`<picture>` переключает вариант по теме GitHub, а не по теме ОС. Готовый сниппет со ссылками на технологии выдаёт `--snippet`.

## Разработка

```bash
npm run build
```

Предпросмотр всех примеров на тёмном и светлом фоне: [examples/gallery.html](examples/gallery.html).

```
src/
  tech.ts    реестр технологий: зависимости → черта, иконка, ссылка; цвета языков
  github.ts  сбор данных: звёзды, коммиты, языки, дерево файлов, парсинг манифестов
  wings.ts   рендер SVG: геометрия, слои перьев, черты, эмблемы, анимации
  icons.ts   иконки simple-icons
  cli.ts     CLI
  mcp.ts     MCP-сервер
action.yml   composite GitHub Action
```
