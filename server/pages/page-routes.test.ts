import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import { errorBodySchema } from "../../shared/errors.ts";
import { createTestApp } from "../test-app.ts";
import { createPageReader, pages } from "./page-routes.ts";

function builtSite(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "dist-"));
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(join(root, file, ".."), { recursive: true });
    writeFileSync(join(root, file), content);
  }
  return root;
}

test("the table maps each Must page to its folder", () => {
  assert.deepEqual(
    pages.map(({ pattern, page }) => `${pattern} ${page}`),
    [
      "/ home",
      "/s/:slug store",
      "/s/:slug/checkout checkout",
      "/o/:token order",
      "/pay/:token pay",
      "/desk desk",
      "/privacy privacy",
      "/sell sell",
      "/c/:slug/:package catering",
      "/board-posts/new board-post",
      "/board-posts/:token board-post",
      "/desk/packages packages",
      "/ops ops",
      "/demo demo",
    ],
  );
});

test("each address answers with the HTML of its page", async () => {
  const { app } = createTestApp({
    readPage: async (page) => `<title>${page}</title>`,
  });
  const cases = {
    "/": "home",
    "/s/shobhas-kitchen": "store",
    "/s/shobhas-kitchen/checkout": "checkout",
    "/o/abcdefghijklmnop": "order",
    "/pay/abcdefghijklmnop": "pay",
    "/desk": "desk",
    "/privacy": "privacy",
    "/c/daawat-caterers/0b8c1f4e-0000-4000-8000-000000000000": "catering",
    "/board-posts/new": "board-post",
    "/board-posts/abcdefghijklmnop": "board-post",
    "/desk/packages": "packages",
    "/demo": "demo",
  };
  for (const [path, page] of Object.entries(cases)) {
    const response = await app.request(path);
    assert.equal(response.status, 200, path);
    assert.match(response.headers.get("Content-Type") ?? "", /^text\/html/);
    assert.equal(response.headers.get("Cache-Control"), "no-cache");
    assert.equal(await response.text(), `<title>${page}</title>`);
  }
});

test("a page whose folder does not exist yet answers 404", async () => {
  const root = builtSite({ "home/index.html": "<title>Home</title>" });
  const { app } = createTestApp({
    readPage: createPageReader(pathToFileURL(`${root}/`)),
  });
  assert.equal((await app.request("/")).status, 200);
  const missing = await app.request("/desk");
  assert.equal(missing.status, 404);
  const { error } = errorBodySchema.parse(await missing.json());
  assert.equal(error.code, "not_found");
});

test("built pages are read once; dev pages are read and transformed each time", async () => {
  const root = builtSite({ "home/index.html": "<title>Home</title>" });
  const rootUrl = pathToFileURL(`${root}/`);
  const built = createPageReader(rootUrl);
  assert.equal(await built("home"), "<title>Home</title>");
  writeFileSync(join(root, "home/index.html"), "<title>New</title>");
  assert.equal(await built("home"), "<title>Home</title>");

  const urls: string[] = [];
  const dev = createPageReader(rootUrl, async (url, html) => {
    urls.push(url);
    return html.replace("<title>", "<title>Dev ");
  });
  assert.equal(await dev("home"), "<title>Dev New</title>");
  assert.equal(await dev("store"), undefined);
  assert.deepEqual(urls, ["/home/index.html"]);
});

test("built assets are served; hashed ones are cached for a year, others revalidate", async () => {
  const root = builtSite({
    "home/index.html": "<title>Home</title>",
    "assets/home-1a2b3c.js": "console.log(1)",
    "icons.svg": "<svg></svg>",
  });
  const { app } = createTestApp({
    readPage: createPageReader(pathToFileURL(`${root}/`)),
    assetsDir: root,
  });
  const script = await app.request("/assets/home-1a2b3c.js");
  assert.equal(script.status, 200);
  assert.equal(
    script.headers.get("Cache-Control"),
    "public, max-age=31536000, immutable",
  );
  const icons = await app.request("/icons.svg");
  assert.equal(icons.status, 200);
  assert.equal(icons.headers.get("Cache-Control"), "no-cache");
  const missing = await app.request("/assets/missing.js");
  assert.equal(missing.status, 404);
  assert.equal(missing.headers.get("Cache-Control"), null);
});

test("the static files never serve a page, so each page comes from the table with no-cache", async () => {
  const root = builtSite({
    "home/index.html": "<title>Home</title>",
    "desk/index.html": "<title>Desk</title>",
  });
  const { app } = createTestApp({
    readPage: createPageReader(pathToFileURL(`${root}/`)),
    assetsDir: root,
  });
  for (const path of [
    "/home",
    "/home/",
    "/home/index.html",
    "/desk/index.html",
    "/index.html",
  ]) {
    assert.equal((await app.request(path)).status, 404, path);
  }
  const desk = await app.request("/desk");
  assert.equal(desk.status, 200);
  assert.equal(desk.headers.get("Cache-Control"), "no-cache");
});

test("a page reader gets the request's signal, and the file reader uses it", async () => {
  const signals: (AbortSignal | undefined)[] = [];
  const { app } = createTestApp({
    readPage: async (_page, signal) => {
      signals.push(signal);
      return "<title>Home</title>";
    },
  });
  await app.request("/");
  assert.ok(signals[0] instanceof AbortSignal);

  const root = builtSite({ "home/index.html": "<title>Home</title>" });
  const read = createPageReader(pathToFileURL(`${root}/`));
  await assert.rejects(read("home", AbortSignal.abort()), {
    name: "AbortError",
  });
  assert.equal(await read("home"), "<title>Home</title>");
});
