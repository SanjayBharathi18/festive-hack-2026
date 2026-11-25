import { readFile } from "node:fs/promises";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import type { AppEnv } from "../http/context.ts";

export type PageReader = (
  page: string,
  signal?: AbortSignal,
) => Promise<string | undefined>;

export const pages = [
  { pattern: "/", page: "home" },
  { pattern: "/s/:slug", page: "store" },
  { pattern: "/s/:slug/checkout", page: "checkout" },
  { pattern: "/o/:token", page: "order" },
  { pattern: "/pay/:token", page: "pay" },
  { pattern: "/desk", page: "desk" },
  { pattern: "/privacy", page: "privacy" },
  { pattern: "/sell", page: "sell" },
  { pattern: "/c/:slug/:package", page: "catering" },
  { pattern: "/board-posts/new", page: "board-post" },
  { pattern: "/board-posts/:token", page: "board-post" },
  { pattern: "/desk/packages", page: "packages" },
  { pattern: "/ops", page: "ops" },
  { pattern: "/demo", page: "demo" },
] as const;

export function pageRoutes({
  readPage,
  assetsDir,
}: {
  readPage: PageReader;
  assetsDir?: string | undefined;
}): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  for (const { pattern, page } of pages) {
    app.get(pattern, async (c) => {
      const html = await readPage(page, c.req.raw.signal);
      if (html === undefined) return c.notFound();
      c.header("Cache-Control", "no-cache");
      return c.html(html);
    });
  }
  if (assetsDir !== undefined) {
    const serveFile = serveStatic({ root: assetsDir });
    app.use("/*", async (c, next) => {
      if (!isStaticFile(c.req.path)) return next();
      await next();
      if (c.res.ok) {
        c.header(
          "Cache-Control",
          c.req.path.startsWith("/assets/")
            ? "public, max-age=31536000, immutable"
            : "no-cache",
        );
      }
    });
    app.use("/*", (c, next) =>
      isStaticFile(c.req.path) ? serveFile(c, next) : next(),
    );
  }
  return app;
}

export function createPageReader(
  root: URL,
  transform?: (url: string, html: string) => Promise<string>,
): PageReader {
  const cache = new Map<string, string | undefined>();
  return async (page, signal) => {
    if (transform === undefined && cache.has(page)) return cache.get(page);
    const html = await readFile(new URL(`${page}/index.html`, root), {
      encoding: "utf8",
      signal,
    }).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return undefined;
      throw error;
    });
    if (transform === undefined) {
      cache.set(page, html);
      return html;
    }
    return html === undefined
      ? undefined
      : transform(`/${page}/index.html`, html);
  };
}

function isStaticFile(path: string): boolean {
  const name = path.slice(path.lastIndexOf("/") + 1);
  return /\.[\w-]+$/.test(name) && !/\.html?$/i.test(name);
}
