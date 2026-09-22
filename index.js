#!/usr/bin/env node
/**
 * next-route-mapper
 *
 * Scans a Next.js App Router project for API route handlers
 * (app/api/**\/route.ts|js|...) and lists every endpoint together
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
    format: "table",
    output: null,
    help: false,
    color: true,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dir" || a === "-d") args.dir = argv[++i];
    else if (a === "--format" || a === "-f") args.format = argv[++i];
    else if (a === "--output" || a === "-o") args.output = argv[++i];
    else if (a === "--no-color") args.color = false;
    else if (a === "--help" || a === "-h") args.help = true;
  }
  return args;
}

function findApiDir(startDir) {
  const candidates = [
    path.join(startDir, "app", "api"),
    path.join(startDir, "src", "app", "api"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c) && fs.statSync(c).isDirectory()) return c;
  }
  return null;
}

function walk(dir, fileList = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, fileList);
    } else if (/^route\.(ts|tsx|js|jsx|mjs|cjs)$/.test(entry.name)) {
      fileList.push(full);
    }
  }
  return fileList;
}

function extractMethods(fileContent) {
  const found = new Set();

  // export async function GET(...) / export function POST(...)
  const fnPattern =
    /export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s*\(/g;
  let m;
  while ((m = fnPattern.exec(fileContent))) found.add(m[1]);

  // export const GET = ... / export const GET: SomeType = ...
  const constPattern =
    /export\s+const\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s*[:=]/g;
  while ((m = constPattern.exec(fileContent))) found.add(m[1]);

  // export { GET, POST as CustomName } — plain re-exports
  const reExportBlocks = fileContent.match(/export\s*{([^}]+)}/g);
  if (reExportBlocks) {
    for (const block of reExportBlocks) {
      for (const method of HTTP_METHODS) {
        const re = new RegExp(
          `(^|[\\s,{])${method}(\\s*,|\\s*}|\\s+as\\s+)`,
          "m",
        );
        if (re.test(block)) found.add(method);
      }
    }
  }

  return HTTP_METHODS.filter((m) => found.has(m));
}

function toRoutePath(apiDir, filePath) {
  let rel = path.relative(apiDir, path.dirname(filePath));
  rel = rel.split(path.sep).join("/"); // normalize Windows backslashes to forward slashes
  // Strip Next.js route groups: segments wrapped in parentheses, e.g. (admin)
  const segments = rel.split("/").filter((seg) => seg && !/^\(.*\)$/.test(seg));
  const routePath = "/" + segments.join("/");
  return routePath === "/" ? "/" : routePath;
}

function scan(apiDir) {
  const files = walk(apiDir);
  const results = files.map((file) => ({
    route: toRoutePath(apiDir, file),
    methods: extractMethods(fs.readFileSync(file, "utf8")),
    file: path.relative(process.cwd(), file).split(path.sep).join("/"),
  }));
  results.sort((a, b) => a.route.localeCompare(b.route));
  return results;
}

// Table rendering
function visibleLength(str) {
  // Strip ANSI escape codes before measuring, so padding lines up
  // correctly even when colors are enabled.
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

function printTable(results, colorEnabled) {
  const c = buildColorizer(colorEnabled);

  if (results.length === 0) {
    console.log(c.yellow("No API routes found."));
    return;
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

  console.log("");
  console.log(c.bold(c.brightCyan("Next.js API Routes")));
  console.log(c.dim(top));
  console.log(headerRow);
  console.log(c.dim(mid));

  for (const r of rows) {
    const line =
      "│ " +
      padVisible(c.cyan(r.route), routeWidth) +
      " │ " +
      padVisible(r.methodsColored, methodWidth) +
      " │ " +
      padVisible(c.dim(r.file), fileWidth) +
      " │";
    console.log(line);
  }

  console.log(c.dim(bot));
  console.log(
    c.bold("\nTotal endpoints: ") +
      c.brightGreen(c.bold(String(results.length))) +
      "\n",
  );
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
  node index.js [options]
  npx next-route-mapper [options]
 
Options:
  -d, --dir <path>       Project root to scan (default: current directory)
  -f, --format <type>    Output format: table | json | markdown (md) (default: table)
  -o, --output <file>    Write output to a file instead of stdout
      --no-color         Disable colored output
  -h, --help             Show this help message
 
Examples:
  node index.js
  node index.js --dir ../my-next-app
  node index.js --no-color
  node index.js --format markdown --output API.md or node index.js -f md -o API.md
  node index.js --format json --output routes.json
`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) return printHelp();

  const root = args.dir ? path.resolve(args.dir) : process.cwd();
  const apiDir = findApiDir(root);

  if (!apiDir) {
    console.error(
      `Could not find an "app/api" or "src/app/api" directory under:\n  ${root}\n\nPass --dir to point at your Next.js project root, e.g.:\n  node index.js --dir ../my-next-app`,
    );
    process.exitCode = 1;
    return;
  }

  const results = scan(apiDir);

  const colorEnabled =
    args.color &&
    !process.env.NO_COLOR &&
    Boolean(process.stdout.isTTY || process.env.FORCE_COLOR);

  if (!args.output && args.format === "table") {
    return printTable(results, colorEnabled);
  }

  let output;
  if (args.format === "json") {
    output = JSON.stringify(results, null, 2);
  } else if (args.format === "markdown" || args.format === "md") {
    output = toMarkdown(results);
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

// ESM equivalent of CommonJS's `require.main === module`: only auto-run
// main() when this file is executed directly (as the CLI), not when it's
// imported by the test suite.
const isMainModule =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMainModule) {
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
  visibleLength,
  buildColorizer,
  HTTP_METHODS,
};
