# next-route-mapper

[![CI](https://github.com/nero-tx/next-route-mapper/actions/workflows/ci.yml/badge.svg)](https://github.com/nero-tx/next-route-mapper/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/next-route-mapper.svg)](https://www.npmjs.com/package/next-route-mapper)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/nero-tx/next-route-mapper/blob/main/LICENSE)

A zero-dependency CLI for scanning Next.js App Router API endpoints and their exported HTTP methods — `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, `OPTIONS`.

### Why?

As Next.js App Router projects scale, API handlers get nested deep within `route.ts` files throughout the folder structure. Developers easily lose track of how many API routes exist, what their exact URL endpoints are, and which HTTP verbs each route handles.

`next-route-mapper` solves this confusion in seconds. Pass a project root or a specific sub-path (like `app/api/auth`), and get an instant, clear map ready for PRs, auditing, or living documentation.

```
📡 Next.js API Routes
┌──────────────────┬────────────────────┬────────────────────────────────────────┐
│ ROUTE            │ METHODS            │ FILE                                   │
├──────────────────┼────────────────────┼────────────────────────────────────────┤
│ /api/auth/login  │ POST               │ app/api/auth/login/route.ts            │
│ /api/products    │ GET, POST          │ app/api/products/route.ts              │
│ /api/products/[id]│ GET, PATCH, DELETE│ app/api/products/[id]/route.ts        │
└──────────────────┴────────────────────┴────────────────────────────────────────┘

Total endpoints: 3
```

Methods are color-coded in terminals (`GET` green, `POST` blue, `PUT` yellow, `PATCH` magenta, `DELETE` red, `HEAD`/`OPTIONS` cyan/gray).

---

## Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [Options & Flags](#options--flags)
- [Examples](#examples)
- [Features](#features)
- [Programmatic API](#programmatic-api)
- [License](#license)

---

## Installation

Install as a development dependency:

```bash
npm install -D next-route-mapper
```

---

## Quick Start

Run using `npx nrmap` (or `npx next-route-mapper`):

```bash
# Scan current working directory (.) by default
npx nrmap

# Scan a specific Next.js project directory
npx nrmap ./my-next-app

# Scan a specific sub-route path (e.g., auth endpoints only)
npx nrmap app/api/auth
```

---

## Options & Flags

```bash
npx nrmap [path] [options]
```

| Flag        | Description                                          | Default                         |
| ----------- | ---------------------------------------------------- | ------------------------------- |
| `[path]`    | Path to project root or sub-folder                   | Current working directory (`.`) |
| `-f <type>` | Output format: `table`, `json`, or `markdown` (`md`) | `table`                         |
| `-o <file>` | Save output directly to a file path                  | stdout                          |
| `-h`        | Display usage help                                   | —                               |

> **Smart Format Inference:** When using `-o <file>` without specifying `-f`, format is inferred automatically from the file extension (`.md` -> Markdown, `.json` -> JSON).

---

## Examples

```bash
# Default terminal table scan
npx nrmap

# Scan specific sub-directory
npx nrmap app/api/auth

# Output as a Markdown table
npx nrmap app/api -f md

# Write Markdown table directly to API.md
npx nrmap -o API.md

# Save JSON data for custom tooling or scripts
npx nrmap -f json -o routes.json
```

---

## Features

- **Flexible Path Scanning**: Scans full projects or sub-folders (e.g. `app/api/auth`) while computing canonical URL routes relative to `app` or `src/app`.
- **Comprehensive Handler Matching**: Detects async/sync function exports, `const`/`let`/`var` handlers, and re-exports (`export { GET, POST }` or `export { handler as GET }`).
- **Route Group & Slot Cleanup**: Strips Next.js route groups (`(admin)`), parallel route slots (`@modal`), and intercepting route markers while preserving dynamic (`[id]`) and catch-all (`[...slug]`) parameters.
- **Zero Dependencies**: Pure Node.js (`fs`/`path` only) — runs fast on macOS, Linux, and Windows.

---

## License

[MIT](./LICENSE) © [nero-tx](https://github.com/nero-tx)
