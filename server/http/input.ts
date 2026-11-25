import type { Context } from "hono";
import type { z } from "zod";
import { appError } from "./errors.ts";

export const jsonLimitBytes = 64 * 1024;

const jsonMediaType = /^application\/([\w.-]+\+)?json$/i;

export async function readJson<S extends z.ZodType>(
  c: Context,
  schema: S,
  { limitBytes = jsonLimitBytes }: { limitBytes?: number } = {},
): Promise<z.output<S>> {
  const mediaType = c.req.header("Content-Type")?.split(";")[0]?.trim() ?? "";
  if (!jsonMediaType.test(mediaType)) {
    throw appError(
      415,
      "unsupported_media_type",
      "Send the body as JSON, with Content-Type: application/json.",
    );
  }
  const text = (await readBody(c.req.raw, limitBytes)).toString("utf8");
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw appError(
      400,
      "invalid_input",
      "The request body is not valid JSON. Check it and send it again.",
    );
  }
  return parseInput(schema, value);
}

export function parseInput<S extends z.ZodType>(
  schema: S,
  value: unknown,
): z.output<S> {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  const fields = new Set(
    result.error.issues.map((issue) => issue.path.join(".") || "body"),
  );
  throw appError(
    400,
    "invalid_input",
    `Check these fields: ${[...fields].join(", ")}.`,
  );
}

export async function readBody(
  request: Request,
  limitBytes: number,
): Promise<Buffer> {
  const tooLarge = () =>
    appError(
      413,
      "payload_too_large",
      `The request body is over ${Math.round(limitBytes / 1024)} KB. Send less data.`,
    );
  if (Number(request.headers.get("Content-Length")) > limitBytes) {
    throw tooLarge();
  }
  if (request.body === null) return Buffer.alloc(0);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limitBytes) {
      await reader.cancel();
      throw tooLarge();
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}
