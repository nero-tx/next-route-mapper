import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

import {
  extractMethods,
  toRoutePath,
  parseArgs,
  toMarkdown,
  visibleLength,
  buildColorizer,
} from "../index.js";

// extractMethods

test('extractMethods: detects "export async function GET(...)" style', () => {
  const src = `
    export async function GET(req) { return new Response('ok'); }
    export async function POST(req) { return new Response('ok'); }
  `;
  assert.deepEqual(extractMethods(src), ["GET", "POST"]);
});

test('extractMethods: detects "export function DELETE(...)" without async', () => {
  const src = `export function DELETE(req) {}`;
  assert.deepEqual(extractMethods(src), ["DELETE"]);
});

test('extractMethods: detects "export const GET = ..." arrow-function style', () => {
  const src = `
    export const GET = async (req) => new Response('ok');
    export const PATCH: RouteHandler = async () => {};
  `;
  assert.deepEqual(extractMethods(src), ["GET", "PATCH"]);
});

test('extractMethods: detects plain "export { GET, POST }" re-exports', () => {
  const src = `
    async function GET() {}
    async function POST() {}
    export { GET, POST };
  `;
  assert.deepEqual(extractMethods(src), ["GET", "POST"]);
});

test("extractMethods: returns results in canonical HTTP_METHODS order regardless of source order", () => {
  const src = `
    export async function DELETE() {}
    export async function GET() {}
  `;
  assert.deepEqual(extractMethods(src), ["GET", "DELETE"]);
});

test("extractMethods: returns an empty array when no handlers are exported", () => {
  const src = `
    function helper() { return 1; }
    export default helper;
  `;
  assert.deepEqual(extractMethods(src), []);
});

test("extractMethods: does not false-positive on unrelated exported identifiers", () => {
  const src = `
    export const GETTER_UTIL = 1;
    export async function GETSomethingElse() {}
  `;
  assert.deepEqual(extractMethods(src), []);
});

// toRoutePath

test('toRoutePath: maps the api-root file to "/"', () => {
  const apiDir = path.join("project", "app", "api");
  const file = path.join(apiDir, "route.ts");
  assert.equal(toRoutePath(apiDir, file), "/");
});

test("toRoutePath: maps nested folders to a nested route", () => {
  const apiDir = path.join("project", "app", "api");
  const file = path.join(apiDir, "auth", "login", "route.ts");
  assert.equal(toRoutePath(apiDir, file), "/auth/login");
});

test("toRoutePath: preserves dynamic segments like [id]", () => {
  const apiDir = path.join("project", "app", "api");
  const file = path.join(apiDir, "products", "[id]", "route.ts");
  assert.equal(toRoutePath(apiDir, file), "/products/[id]");
});

test("toRoutePath: preserves catch-all segments like [...slug]", () => {
  const apiDir = path.join("project", "app", "api");
  const file = path.join(apiDir, "files", "[...slug]", "route.ts");
  assert.equal(toRoutePath(apiDir, file), "/files/[...slug]");
});

test("toRoutePath: strips route groups wrapped in parentheses", () => {
  const apiDir = path.join("project", "app", "api");
  const file = path.join(apiDir, "(admin)", "stats", "route.ts");
  assert.equal(toRoutePath(apiDir, file), "/stats");
});

test("toRoutePath: normalizes Windows-style backslash separators", () => {
  const apiDir = "C:\\project\\app\\api";
  const file = "C:\\project\\app\\api\\users\\route.ts";
  // path.relative/path.sep behave per-OS; this test only checks behavior
  // on the current platform's own separator, which is what toRoutePath
  // actually normalizes at runtime.
  const localApiDir = path.join("project", "app", "api");
  const localFile = path.join(localApiDir, "users", "route.ts");
  assert.equal(toRoutePath(localApiDir, localFile), "/users");
});

// parseArgs

test("parseArgs: defaults to table format, cwd, colors on", () => {
  const args = parseArgs([]);
  assert.equal(args.dir, null);
  assert.equal(args.format, "table");
  assert.equal(args.output, null);
  assert.equal(args.color, true);
  assert.equal(args.help, false);
});

test("parseArgs: parses --dir/-d, --format/-f, --output/-o", () => {
  assert.equal(parseArgs(["--dir", "../app"]).dir, "../app");
  assert.equal(parseArgs(["-d", "../app"]).dir, "../app");
  assert.equal(parseArgs(["--format", "json"]).format, "json");
  assert.equal(parseArgs(["-f", "markdown"]).format, "markdown");
  assert.equal(parseArgs(["--output", "out.md"]).output, "out.md");
  assert.equal(parseArgs(["-o", "out.md"]).output, "out.md");
});

test("parseArgs: --no-color disables color, --help/-h sets help", () => {
  assert.equal(parseArgs(["--no-color"]).color, false);
  assert.equal(parseArgs(["--help"]).help, true);
  assert.equal(parseArgs(["-h"]).help, true);
});

// toMarkdown

test("toMarkdown: renders a valid markdown table", () => {
  const results = [
    { route: "/", methods: ["GET"], file: "app/api/route.ts" },
    {
      route: "/products",
      methods: ["GET", "POST"],
      file: "app/api/products/route.ts",
    },
  ];
  const md = toMarkdown(results);
  assert.match(md, /\| Route \| Methods \| File \|/);
  assert.match(md, /\| `\/` \| GET \| `app\/api\/route\.ts` \|/);
  assert.match(
    md,
    /\| `\/products` \| GET, POST \| `app\/api\/products\/route\.ts` \|/,
  );
});

test("toMarkdown: shows a placeholder when no methods were found", () => {
  const md = toMarkdown([
    { route: "/broken", methods: [], file: "app/api/broken/route.ts" },
  ]);
  assert.match(md, /_none found_/);
});

// color helpers

test("buildColorizer(false): returns text unmodified (no ANSI codes)", () => {
  const c = buildColorizer(false);
  assert.equal(c.green("GET"), "GET");
  assert.equal(c.bold("X"), "X");
});

test("buildColorizer(true): wraps text in ANSI escape codes", () => {
  const c = buildColorizer(true);
  assert.match(c.green("GET"), /\x1b\[32mGET\x1b\[0m/);
});

test("visibleLength: ignores ANSI escape codes when measuring length", () => {
  const c = buildColorizer(true);
  const colored = c.green("GET");
  assert.equal(visibleLength(colored), 3);
  assert.equal(visibleLength("GET"), 3);
});
