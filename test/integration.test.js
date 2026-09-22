import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { scan, findApiDir } from "../index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI_PATH = path.join(__dirname, "..", "index.js");

/** Builds a throwaway Next.js-style project with an app/api tree. */
function makeFixtureProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "next-route-mapper-"));
  const apiDir = path.join(root, "app", "api");

  const files = {
    "route.ts": `export async function GET() { return new Response('root'); }`,
    "auth/login/route.ts": `export async function POST() {}`,
    "products/route.ts": `export async function GET() {}\nexport async function POST() {}`,
    "products/[id]/route.ts": `export async function GET() {}\nexport async function PATCH() {}\nexport async function DELETE() {}`,
    "(admin)/stats/route.ts": `export async function GET() {}`,
    "empty/route.ts": `// no handlers exported here\nconst helper = () => {};`,
  };

  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(apiDir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content, "utf8");
  }

  return root;
}

function cleanup(root) {
  fs.rmSync(root, { recursive: true, force: true });
}

//  findApiDir + scan() — exercised directly as a library

test("findApiDir: locates app/api under the project root", () => {
  const root = makeFixtureProject();
  try {
    const found = findApiDir(root);
    assert.equal(found, path.join(root, "app", "api"));
  } finally {
    cleanup(root);
  }
});

test("findApiDir: falls back to src/app/api when app/api is absent", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "next-route-mapper-"));
  try {
    const apiDir = path.join(root, "src", "app", "api");
    fs.mkdirSync(apiDir, { recursive: true });
    fs.writeFileSync(
      path.join(apiDir, "route.ts"),
      `export async function GET() {}`,
    );
    assert.equal(findApiDir(root), apiDir);
  } finally {
    cleanup(root);
  }
});

test("findApiDir: returns null when no api directory exists", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "next-route-mapper-"));
  try {
    assert.equal(findApiDir(root), null);
  } finally {
    cleanup(root);
  }
});

test("scan: finds every route.ts file and reports correct routes + methods", () => {
  const root = makeFixtureProject();
  try {
    const apiDir = findApiDir(root);
    const results = scan(apiDir);
    const byRoute = Object.fromEntries(
      results.map((r) => [r.route, r.methods]),
    );

    assert.deepEqual(byRoute["/"], ["GET"]);
    assert.deepEqual(byRoute["/auth/login"], ["POST"]);
    assert.deepEqual(byRoute["/products"], ["GET", "POST"]);
    assert.deepEqual(byRoute["/products/[id]"], ["GET", "PATCH", "DELETE"]);
    assert.deepEqual(byRoute["/empty"], []);
    // The (admin) route group must not appear in the URL.
    assert.deepEqual(byRoute["/stats"], ["GET"]);
    assert.equal("/(admin)/stats" in byRoute, false);

    assert.equal(results.length, 6);
  } finally {
    cleanup(root);
  }
});

test("scan: results are sorted alphabetically by route", () => {
  const root = makeFixtureProject();
  try {
    const results = scan(findApiDir(root));
    const routes = results.map((r) => r.route);
    const sorted = [...routes].sort((a, b) => a.localeCompare(b));
    assert.deepEqual(routes, sorted);
  } finally {
    cleanup(root);
  }
});

//  CLI — exercised as a real subprocess, exactly as an end user runs it
test("CLI: table output lists every route and a total count", () => {
  const root = makeFixtureProject();
  try {
    const out = execFileSync("node", [CLI_PATH, "--dir", root, "--no-color"], {
      encoding: "utf8",
    });
    assert.match(out, /\/products\/\[id\]/);
    assert.match(out, /GET, PATCH, DELETE/);
    assert.match(out, /Total endpoints: 6/);
  } finally {
    cleanup(root);
  }
});

test("CLI: --format json produces valid, parseable JSON matching scan()", () => {
  const root = makeFixtureProject();
  try {
    const out = execFileSync(
      "node",
      [
        CLI_PATH,
        "--dir",
        root,
        "--format",
        "json",
        "--output",
        path.join(root, "routes.json"),
      ],
      { encoding: "utf8" },
    );
    assert.match(out, /Wrote 6 route\(s\)/);

    const written = JSON.parse(
      fs.readFileSync(path.join(root, "routes.json"), "utf8"),
    );
    assert.equal(written.length, 6);
    const productsIdRoute = written.find((r) => r.route === "/products/[id]");
    assert.deepEqual(productsIdRoute.methods, ["GET", "PATCH", "DELETE"]);
  } finally {
    cleanup(root);
  }
});

test("CLI: --format markdown produces a markdown table", () => {
  const root = makeFixtureProject();
  try {
    const out = execFileSync(
      "node",
      [CLI_PATH, "--dir", root, "--format", "markdown"],
      {
        encoding: "utf8",
      },
    );
    assert.match(out, /\| Route \| Methods \| File \|/);
    assert.match(out, /\| `\/products\/\[id\]` \| GET, PATCH, DELETE \|/);
  } finally {
    cleanup(root);
  }
});

test("CLI: exits with a non-zero code and a helpful message when app/api is missing", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "next-route-mapper-"));
  try {
    assert.throws(() => {
      execFileSync("node", [CLI_PATH, "--dir", root], {
        encoding: "utf8",
        stdio: "pipe",
      });
    }, /Command failed/);
  } finally {
    cleanup(root);
  }
});

test("CLI: --help prints usage and exits 0", () => {
  const out = execFileSync("node", [CLI_PATH, "--help"], { encoding: "utf8" });
  assert.match(out, /next-route-mapper/);
  assert.match(out, /--dir/);
  assert.match(out, /--format/);
});
