# next-route-mapper

[![CI](https://github.com/nero-tx/next-route-mapper/actions/workflows/ci.yml/badge.svg)](https://github.com/nero-tx/next-route-mapper/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/next-route-mapper.svg)](https://www.npmjs.com/package/next-route-mapper)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

A tiny, dependency-free, **cross-platform** CLI that scans a [Next.js App Router](https://nextjs.org/docs/app) project and lists every API endpoint under `app/api` (or `src/app/api`) along with the HTTP methods each route implements — `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, `OPTIONS`.

Runs identically on **Windows, macOS, and Linux** — no WSL, no Git Bash, no shell-specific syntax.

```
📡  Next.js API Routes
┌────────────────┬────────────────────┬───────────────────────────────────────┐
│ ROUTE          │ METHODS            │ FILE                                  │
├────────────────┼────────────────────┼───────────────────────────────────────┤
│ /               │ GET                │ app/api/route.ts                      │
│ /auth/login     │ POST               │ app/api/auth/login/route.ts           │
│ /products       │ GET, POST          │ app/api/products/route.ts             │
│ /products/[id]  │ GET, PATCH, DELETE │ app/api/products/[id]/route.ts        │
└────────────────┴────────────────────┴───────────────────────────────────────┘

Total endpoints: 4
```

Methods are color-coded in a real terminal (`GET` green, `POST` blue, `PUT` yellow, `PATCH` magenta, `DELETE` red, `HEAD`/`OPTIONS` cyan/gray). Colors auto-disable when output isn't a TTY (piped, redirected, CI) or when `NO_COLOR` is set.

## Contents

- [Quick start](#quick-start)
- [Why](#why)
- [Requirements](#requirements)
- [Installation](#installation)
- [Usage](#usage)
- [How it works](#how-it-works)
- [Limitations](#limitations)
- [Contributing](#contributing)

## Quick start

No install needed — run it against any Next.js project:

```bash
npx next-route-mapper --dir /path/to/your/next-app
```

Want a Markdown table instead of the terminal view? Use the `-df` shorthand:

```bash
npx next-route-mapper -d /path/to/your/next-app -f md
```

Once installed, you can also use the shorter alias `nrm` instead of `next-route-mapper`:

````bash
nrm --dir .
``` --dir /path/to/your/next-app
````

## Why

App Router API routes live in nested `route.ts` files, so it's easy to lose track of how many endpoints exist, what they're called, and which verbs they support — especially in a large project. This tool builds that map in seconds, ready to eyeball, paste into a PR, or turn into living API docs.

## Requirements

- [Node.js](https://nodejs.org/) 18+ — no other dependencies.

```bash
node -v
```

Published as native ESM (`"type": "module"`). CLI usage (`npx next-route-mapper`, `nrm`) is unaffected either way; programmatic use requires `import { scan } from 'next-route-mapper'` rather than `require(...)`.

## Installation

| Use case                                   | Command                                    |
| ------------------------------------------ | ------------------------------------------ |
| One-off run, no install                    | `npx next-route-mapper --dir <path>`       |
| Available everywhere                       | `npm install -g next-route-mapper`         |
| Pinned per-project (recommended for teams) | `npm install --save-dev next-route-mapper` |

Once installed globally or as a dev dependency, both `next-route-mapper` and the shorter alias **`nrm`** are available:

```bash
next-route-mapper --dir .
nrm --dir .
```

> `nrm` is also the name of an unrelated, popular package (npm registry manager). If you already have that installed globally, `npm install -g` may skip linking this package's `nrm` command — `next-route-mapper` always works regardless.

For a dev-dependency install, wire it into `package.json` so the team runs one shared command:

```json
{
  "scripts": {
    "routes": "next-route-mapper"
  }
}
```

```bash
npm run routes -- --format markdown --output API.md
```

## Usage

```bash
next-route-mapper [options]   # or: nrm [options]
```

| Flag                  | Alias | Description                                    | Default                  |
| --------------------- | ----- | ---------------------------------------------- | ------------------------ |
| `--dir <path>`        | `-d`  | Project root to scan                           | current directory        |
| `--format <type>`     | `-f`  | `table`, `json`, or `markdown` (`md`)          | `table`                  |
| `--output <file>`     | `-o`  | Write to a file instead of stdout              | prints to console        |
| `--dir-format <path>` | `-df` | Shorthand for `--dir <path> --format markdown` | —                        |
| `--no-color`          | —     | Disable colored table output                   | colors on when supported |
| `--help`              | `-h`  | Show usage help                                | —                        |

Looks for `app/api` first, then `src/app/api`, relative to `--dir` (or the current directory if omitted).

**Examples:**

```bash
nrm                                          # scan cwd, print a table
nrm -d ../my-next-app                        # scan a different project
nrm --no-color                               # plain output, useful for logs/CI
nrm -f md --output API.md                    # write a Markdown doc
nrm -f json --output routes.json             # write JSON for tooling
```

## How it works

1. Recursively walks `app/api` (or `src/app/api`) with Node's built-in `fs`/`path` — no shell commands, so behavior and path separators are identical across OSes.
2. For every `route.ts`/`.tsx`/`.js`/`.jsx`/`.mjs`/`.cjs` file, pattern-matches exported `GET`/`POST`/`PUT`/`PATCH`/`DELETE`/`HEAD`/`OPTIONS` handlers, covering:
   - `export async function GET(...)`
   - `export const GET = ...`
   - `export { GET, POST as SomeAlias }`
3. Converts each folder path to a URL route, stripping [route groups](https://nextjs.org/docs/app/building-your-application/routing/route-groups) like `(admin)` while keeping dynamic segments (`[id]`) and catch-alls (`[...slug]`) intact.
4. Prints a sorted table, or writes Markdown/JSON, with route, methods, and source file.

## Limitations

- Only detects methods exported directly by name — handlers assembled dynamically at runtime (via a factory function, for example) aren't picked up.
- Doesn't inspect middleware or route matchers; it reflects only what each `route.ts` file exports.

## Contributing

Issues and PRs welcome. Please keep the tool dependency-free so it stays trivially portable.

## License

MIT
