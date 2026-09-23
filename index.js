#!/usr/bin/env node
/**
 * next-route-mapper
 *
 * Scans a Next.js App Router project for API route handlers
 * (app/.../route.ts|js|...) and lists every endpoint together
 * with the HTTP methods it implements.
 *
 * Pure Node.js (fs/path only) — no shell commands — so it runs
 * identically on macOS, Linux, and Windows.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HTTP_METHODS = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
];

/**
 *  Colors — hand-rolled ANSI, zero dependencies.
 *  Disabled automatically when NO_COLOR is set, when --no-color is
 *  passed, or when stdout isn't a TTY (e.g. piped to a file).
 */
const RAW_CODES = {
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  gray: "\x1b[90m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  brightBlue: "\x1b[94m",
  brightGreen: "\x1b[92m",
  brightCyan: "\x1b[96m",
};
const RESET = "\x1b[0m";

function buildColorizer(enabled) {
  const c = {};
  for (const name of Object.keys(RAW_CODES)) {
    c[name] = enabled ? (s) => `${RAW_CODES[name]}${s}${RESET}` : (s) => s;
  }
  return c;
}

const METHOD_COLOR_NAME = {
  GET: "brightGreen",
  POST: "brightBlue",
  PUT: "yellow",
  PATCH: "magenta",
  DELETE: "red",
  HEAD: "brightCyan",
  OPTIONS: "gray",
};

function parseArgs(argv) {
  const args = {
    dir: null,
    format: null,
    output: null,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-h" || a === "--help") {
      args.help = true;
    } else if (a === "-f" || a === "--format") {
      args.format = argv[++i];
    } else if (a === "-o" || a === "--output") {
      args.output = argv[++i];
    } else if (a === "-d" || a === "--dir") {
      args.dir = argv[++i];
    } else if (!a.startsWith("-")) {
      if (!args.dir) {
        args.dir = a;
      }
    }
  }

  if (!args.format) {
    if (args.output && args.output.endsWith(".json")) {
      args.format = "json";
    } else if (
      args.output &&
      (args.output.endsWith(".md") || args.output.endsWith(".markdown"))
    ) {
      args.format = "markdown";
    } else {
      args.format = "table";
    }
  }

  return args;
}

function resolveRouteBase(startDir, scanDir) {
  const absScan = path.resolve(scanDir);

  const apiMatch = absScan.match(/(^|[/\\])(?:src[/\\])?app[/\\]api([/\\]|$)/);
  if (apiMatch) {
    const idx = absScan.indexOf(apiMatch[0]);
    return absScan.slice(0, idx + apiMatch[0].replace(/[/\\]$/, "").length);
  }

  const appMatch = absScan.match(/(^|[/\\])(?:src[/\\])?app([/\\]|$)/);
  if (appMatch) {
    const idx = absScan.indexOf(appMatch[0]);
    return absScan.slice(0, idx + appMatch[0].replace(/[/\\]$/, "").length);
  }

  return scanDir;
}

function findApiDir(startDir) {
  const candidates = [
    path.join(startDir, "app", "api"),
    path.join(startDir, "src", "app", "api"),
    path.join(startDir, "app"),
    path.join(startDir, "src", "app"),
    startDir,
  ];

  for (const c of candidates) {
    if (fs.existsSync(c) && fs.statSync(c).isDirectory()) {
      if (c === startDir) {
        const files = walk(c);
        if (files.length > 0) return c;
      } else {
        return c;
      }
    }
  }
  return null;
}

function walk(dir, fileList = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return fileList;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      walk(full, fileList);
    } else if (/^route\.(ts|tsx|js|jsx|mjs|cjs)$/.test(entry.name)) {
      fileList.push(full);
    }
  }
  return fileList;
}

function extractMethods(fileContent) {
  const found = new Set();

  // export async function GET(...) / export function* POST(...)
  const fnPattern =
    /export\s+(?:async\s+)?function\s*\*?\s*(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/g;
  let m;
  while ((m = fnPattern.exec(fileContent))) found.add(m[1]);

  // export const GET = ... / export let POST: SomeType = ...
  const constPattern =
    /export\s+(?:const|let|var)\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b\s*[:=]/g;
  while ((m = constPattern.exec(fileContent))) found.add(m[1]);

  // export { ... } re-exports (e.g. export { GET, POST as CustomName }, export { handler as GET } from './x')
  const reExportBlocks = fileContent.match(/export\s*{([^}]+)}/g);
  if (reExportBlocks) {
    for (const block of reExportBlocks) {
      const inner = block.replace(/^export\s*{/, "").replace(/}.*$/, "");
      const items = inner.split(",");
      for (const rawItem of items) {
        const item = rawItem.trim();
        if (!item) continue;
        let exportedName = item;
        if (/\s+as\s+/.test(item)) {
          exportedName = item.split(/\s+as\s+/)[1].trim();
        }
        if (HTTP_METHODS.includes(exportedName)) {
          found.add(exportedName);
        }
      }
    }
  }

  return HTTP_METHODS.filter((m) => found.has(m));
}

function toRoutePath(apiDir, filePath) {
  let rel = path.relative(apiDir, path.dirname(filePath));
  rel = rel.split(path.sep).join("/"); // normalize Windows backslashes

  if (!rel || rel === ".") return "/";

  const rawSegments = rel.split("/").filter(Boolean);
  const segments = [];

  for (let seg of rawSegments) {
    // Strip route groups: (group)
    if (/^\([^)]+\)$/.test(seg)) continue;
    // Strip parallel route slots: @slot
    if (seg.startsWith("@")) continue;
    // Strip intercepting route markers: (.), (..), (...)
    seg = seg.replace(/^\(\.\.\.|\(\.\.|\(\.\)/, "");
    if (seg) segments.push(seg);
  }

  const routePath = "/" + segments.join("/");
  return routePath;
}

function scan(apiDir) {
  const files = walk(apiDir);
  const baseDir = resolveRouteBase(apiDir, apiDir);
  const results = files.map((file) => ({
    route: toRoutePath(baseDir, file),
    methods: extractMethods(fs.readFileSync(file, "utf8")),
    file: path.relative(process.cwd(), file).split(path.sep).join("/"),
  }));
  results.sort((a, b) => a.route.localeCompare(b.route));
  return results;
}

// Table rendering
function visibleLength(str) {
  return str.replace(/\x1b\[[0-9;]*m/g, "").length;
}

function padVisible(str, width) {
  return str + " ".repeat(Math.max(0, width - visibleLength(str)));
}

function colorizeMethods(r, c) {
  if (!r.methods.length) return c.dim("(none found)");
  return r.methods
    .map((m) => c[METHOD_COLOR_NAME[m] || "white"](c.bold(m)))
    .join(c.dim(", "));
}

function renderTable(results, colorEnabled) {
  const c = buildColorizer(colorEnabled);
  const lines = [];

  if (results.length === 0) {
    return c.yellow("No API routes found.");
  }

  const rows = results.map((r) => ({
    route: r.route,
    methodsPlain: r.methods.length ? r.methods.join(", ") : "(none found)",
    methodsColored: colorizeMethods(r, c),
    file: r.file,
  }));

  const routeWidth = Math.max(5, ...rows.map((r) => r.route.length));
  const methodWidth = Math.max(7, ...rows.map((r) => r.methodsPlain.length));
  const fileWidth = Math.max(4, ...rows.map((r) => r.file.length));

  const horiz = (l, m, r) =>
    l +
    "─".repeat(routeWidth + 2) +
    m +
    "─".repeat(methodWidth + 2) +
    m +
    "─".repeat(fileWidth + 2) +
    r;

  const top = horiz("┌", "┬", "┐");
  const mid = horiz("├", "┼", "┤");
  const bot = horiz("└", "┴", "┘");

  const headerRow =
    "│ " +
    padVisible(c.bold(c.white("ROUTE")), routeWidth) +
    " │ " +
    padVisible(c.bold(c.white("METHODS")), methodWidth) +
    " │ " +
    padVisible(c.bold(c.white("FILE")), fileWidth) +
    " │";

  lines.push("");
  lines.push(c.bold(c.brightCyan("Next.js API Routes")));
  lines.push(c.dim(top));
  lines.push(headerRow);
  lines.push(c.dim(mid));

  for (const r of rows) {
    const line =
      "│ " +
      padVisible(c.cyan(r.route), routeWidth) +
      " │ " +
      padVisible(r.methodsColored, methodWidth) +
      " │ " +
      padVisible(c.dim(r.file), fileWidth) +
      " │";
    lines.push(line);
  }

  lines.push(c.dim(bot));
  lines.push(
    c.bold("\nTotal endpoints: ") +
      c.brightGreen(c.bold(String(results.length))) +
      "\n",
  );

  return lines.join("\n");
}

function toMarkdown(results) {
  let out = "| Route | Methods | File |\n| --- | --- | --- |\n";
  for (const r of results) {
    out += `| \`${r.route}\` | ${r.methods.join(", ") || "_none found_"} | \`${r.file}\` |\n`;
  }
  return out;
}

function printHelp() {
  console.log(`
next-route-mapper — list every Next.js App Router API endpoint and its HTTP methods
 
Usage:
  npx nrmap [path] [options]
  npx next-route-mapper [path] [options]
 
Options:
  -f, --format <type>    Output format: table | json | markdown (md) (default: table)
  -o, --output <file>    Write output to a file instead of stdout
  -h, --help             Show this help message
 
Examples:
  npx nrmap
  npx nrmap ./my-next-app
  npx nrmap app/api/auth
  npx nrmap ./my-next-app -f md
  npx nrmap ./my-next-app -f json -o routes.json
`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) return printHelp();

  const root = args.dir ? path.resolve(args.dir) : process.cwd();
  const apiDir = findApiDir(root);

  if (!apiDir) {
    console.error(
      `Could not find an "app" or "src/app" directory under:\n  ${root}\n\nSpecify the project path as an argument, e.g.:\n  npx nrmap ../my-next-app`,
    );
    process.exitCode = 1;
    return;
  }

  const results = scan(apiDir);

  const colorEnabled =
    !process.env.NO_COLOR &&
    Boolean(process.stdout.isTTY || process.env.FORCE_COLOR);

  let output;
  const isTable = args.format === "table";
  if (args.format === "json") {
    output = JSON.stringify(results, null, 2);
  } else if (args.format === "markdown" || args.format === "md") {
    output = toMarkdown(results);
  } else if (isTable) {
    output = renderTable(results, args.output ? false : colorEnabled);
  } else {
    output = toMarkdown(results);
  }

  if (args.output) {
    fs.writeFileSync(args.output, output, "utf8");
    console.log(`✅ Wrote ${results.length} route(s) to ${args.output}`);
  } else {
    console.log(output);
  }
}

function isMain() {
  if (!process.argv[1]) return false;
  try {
    return fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
}

if (isMain()) {
  main();
}

export {
  parseArgs,
  findApiDir,
  walk,
  extractMethods,
  toRoutePath,
  scan,
  toMarkdown,
  renderTable,
  visibleLength,
  buildColorizer,
  HTTP_METHODS,
};
