import assert from "node:assert/strict";
import type { Hono } from "hono";
import type { AppEnv } from "../http/context.ts";

export async function startCode(
  app: Hono<AppEnv>,
  phone: string,
  purpose: "order" | "desk",
  headers: Record<string, string> = {},
): Promise<string> {
  const response = await postJson(
    app,
    "/api/verify/start",
    { phone, purpose },
    headers,
  );
  assert.equal(response.status, 201, await response.clone().text());
  return ((await response.json()) as { code: string }).code;
}

export async function signIn(
  app: Hono<AppEnv>,
  phone: string,
): Promise<string> {
  const code = await startCode(app, phone, "desk");
  const response = await postJson(app, "/api/verify/check", {
    phone,
    purpose: "desk",
    code,
  });
  assert.equal(response.status, 200, await response.clone().text());
  const cookie = response.headers.get("Set-Cookie")?.split(";")[0];
  assert.ok(cookie);
  return cookie;
}

export async function orderProof(
  app: Hono<AppEnv>,
  phone: string,
  headers: Record<string, string> = {},
): Promise<string> {
  const code = await startCode(app, phone, "order", headers);
  const response = await postJson(app, "/api/verify/check", {
    phone,
    purpose: "order",
    code,
  });
  assert.equal(response.status, 200, await response.clone().text());
  return ((await response.json()) as { proof: string }).proof;
}

export function postJson(
  app: Hono<AppEnv>,
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
): Promise<Response> {
  return Promise.resolve(
    app.request(path, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    }),
  );
}
