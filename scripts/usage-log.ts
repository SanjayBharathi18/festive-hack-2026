import { readFile, writeFile } from "node:fs/promises";
import { z } from "zod";

const entrySchema = z.object({
  time: z.string(),
  script: z.string(),
  api: z.string(),
  model: z.string(),
  result: z.string(),
  units: z.record(z.string(), z.number()),
});
export type UsageEntry = z.infer<typeof entrySchema>;

export const usageLogFile = new URL("../usage.log", import.meta.url);

let appending: Promise<void> = Promise.resolve();

export async function appendUsage(
  file: URL | string,
  entry: UsageEntry,
): Promise<void> {
  const append = appending.then(() => rewrite(file, entry));
  appending = append.catch(() => {});
  return append;
}

export async function readEntries(file: URL | string): Promise<UsageEntry[]> {
  const text = await readFile(file, "utf8").catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return "";
      throw error;
    },
  );
  return text
    .split("\n")
    .map((line, index) => ({ line, number: index + 1 }))
    .filter(({ line }) => line.trim() !== "" && !line.startsWith("#"))
    .map(({ line, number }) => {
      const result = entrySchema.safeParse(safeJson(line));
      if (!result.success) {
        throw new Error(
          `Line ${number} of usage.log is not a usage entry. Fix or remove it.`,
        );
      }
      return result.data;
    });
}

async function rewrite(file: URL | string, entry: UsageEntry): Promise<void> {
  const entries = [...(await readEntries(file)), entry];
  const lines = [
    ...totals(entries),
    ...entries.map((item) => JSON.stringify(item)),
  ];
  await writeFile(file, `${lines.join("\n")}\n`);
}

export function totals(entries: UsageEntry[]): string[] {
  const sums = new Map<string, number>();
  for (const { api, units } of entries) {
    for (const [unit, amount] of Object.entries(units)) {
      const key = `${api} ${unit}`;
      sums.set(key, (sums.get(key) ?? 0) + amount);
    }
  }
  return [
    "# Sarvam calls from dev scripts, with running totals. The server does not write this file.",
    `# calls: ${entries.length}`,
    ...[...sums]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, sum]) => `# ${key}: ${sum}`),
  ];
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
