import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { appendUsage, readEntries, type UsageEntry } from "./usage-log.ts";

function entry(units: Record<string, number>, api = "chat"): UsageEntry {
  return {
    time: "2026-11-24T06:30:00.000Z",
    script: "doctor",
    api,
    model: api === "chat" ? "sarvam-105b" : "saaras:v4",
    result: "200",
    units,
  };
}

function tempFile(): string {
  return join(mkdtempSync(join(tmpdir(), "usage-")), "usage.log");
}

test("each call is added, with the running totals at the top", async () => {
  const file = tempFile();
  await appendUsage(file, entry({ input_tokens: 12, output_tokens: 1 }));
  await appendUsage(file, entry({ input_tokens: 10, output_tokens: 1 }));
  await appendUsage(file, entry({ audio_seconds: 4.5 }, "speech_to_text"));
  const lines = readFileSync(file, "utf8").trimEnd().split("\n");
  assert.deepEqual(lines.slice(1, 5), [
    "# calls: 3",
    "# chat input_tokens: 22",
    "# chat output_tokens: 2",
    "# speech_to_text audio_seconds: 4.5",
  ]);
  assert.equal((await readEntries(file)).length, 3);
  assert.equal(lines.filter((line) => line.startsWith("{")).length, 3);
});

test("a call that billed nothing still counts as a call", async () => {
  const file = tempFile();
  await appendUsage(file, { ...entry({}), result: "403" });
  assert.match(readFileSync(file, "utf8"), /^# calls: 1$/m);
});

test("a broken line is named, not skipped", async () => {
  const file = tempFile();
  writeFileSync(file, "# calls: 1\nnot json\n");
  await assert.rejects(
    appendUsage(file, entry({ input_tokens: 1 })),
    /Line 2 of usage\.log/,
  );
});

test("appends at the same time all reach the file", async () => {
  const file = tempFile();
  await Promise.all(
    Array.from({ length: 5 }, () =>
      appendUsage(file, entry({ input_tokens: 2, output_tokens: 1 })),
    ),
  );
  assert.equal((await readEntries(file)).length, 5);
  const text = readFileSync(file, "utf8");
  assert.match(text, /^# calls: 5$/m);
  assert.match(text, /^# chat input_tokens: 10$/m);
});

test("a failed append does not stop the next one", async () => {
  const broken = tempFile();
  writeFileSync(broken, "not json\n");
  const file = tempFile();
  const [failed, passed] = await Promise.allSettled([
    appendUsage(broken, entry({ input_tokens: 1 })),
    appendUsage(file, entry({ input_tokens: 1 })),
  ]);
  assert.equal(failed?.status, "rejected");
  assert.equal(passed?.status, "fulfilled");
  assert.equal((await readEntries(file)).length, 1);
});
