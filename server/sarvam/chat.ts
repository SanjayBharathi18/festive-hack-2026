import { z } from "zod";
import type { CfgSarvam } from "../flags/decisions.ts";
import {
  callSarvam,
  type Parsed,
  type SarvamDeps,
  type SarvamResult,
} from "./call.ts";

export type ChatJsonInput<S extends z.ZodType> = {
  model: string;
  system: string;
  user: string;
  schema: S;
  schemaName: string;
  reasoning_effort: CfgSarvam["reasoning_effort"];
  max_tokens: number;
  language: string | null;
};

const chatAnswerSchema = z.object({
  choices: z
    .array(
      z.object({
        finish_reason: z.string().nullish(),
        message: z.object({ content: z.string().nullish() }),
      }),
    )
    .min(1),
});

const chatUsageSchema = z.object({
  usage: z.object({
    prompt_tokens: z.number().nonnegative(),
    completion_tokens: z.number().nonnegative(),
    prompt_tokens_details: z
      .object({ cached_tokens: z.number().nonnegative().nullish() })
      .nullish(),
  }),
});

export function chatJson<S extends z.ZodType>(
  deps: SarvamDeps,
  {
    model,
    system,
    user,
    schema,
    schemaName,
    reasoning_effort,
    max_tokens,
    language,
  }: ChatJsonInput<S>,
  signal?: AbortSignal,
): Promise<SarvamResult<z.output<S>>> {
  return callSarvam(
    deps,
    {
      api: "chat",
      model,
      input: user,
      settings: { reasoning_effort, max_tokens },
      body: {
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: schemaName,
            strict: true,
            schema: strictJsonSchema(schema),
          },
        },
        reasoning_effort,
        max_tokens,
      },
    },
    {
      parse: (body) => parseContent(body, schema),
      language: () => language,
      units: chatUnits,
    },
    signal,
  );
}

export function parseContent<S extends z.ZodType>(
  body: unknown,
  schema: S,
): Parsed<z.output<S>> {
  const answer = chatAnswerSchema.safeParse(body);
  const choice = answer.data?.choices[0];
  if (choice === undefined) return { ok: false, reason: "not a chat answer" };
  if (choice.finish_reason === "length") {
    return { ok: false, reason: "finish_reason length" };
  }
  const content = unfence(choice.message.content ?? "");
  if (content === "") return { ok: false, reason: "empty content" };
  let json: unknown;
  try {
    json = JSON.parse(content);
  } catch {
    return { ok: false, reason: "content is not JSON" };
  }
  const result = schema.safeParse(json);
  return result.success
    ? { ok: true, value: result.data }
    : { ok: false, reason: "content does not match the schema" };
}

export function strictJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const { $schema: _, ...jsonSchema } = z.toJSONSchema(schema, {
    io: "output",
  });
  return jsonSchema;
}

export function chatUnits(body: unknown): Record<string, number> {
  const usage = chatUsageSchema.safeParse(body).data?.usage;
  if (usage === undefined) return {};
  const cached = usage.prompt_tokens_details?.cached_tokens ?? 0;
  return {
    input_tokens: usage.prompt_tokens - cached,
    cached_input_tokens: cached,
    output_tokens: usage.completion_tokens,
  };
}

function unfence(content: string): string {
  return content
    .trim()
    .replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/, "$1")
    .trim();
}
