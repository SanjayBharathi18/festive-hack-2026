import assert from "node:assert/strict";
import { test } from "node:test";
import { shareLink } from "./share.ts";

const link = {
  title: "Shobha's Kitchen",
  url: "https://example.test/s/shobhas-kitchen",
};

test("the share sheet comes first", async () => {
  const shared: unknown[] = [];
  const result = await shareLink(
    { share: async (data) => void shared.push(data) },
    link,
  );
  assert.equal(result, "shared");
  assert.deepEqual(shared, [link]);
});

test("a closed share sheet is not a failure, and copies nothing", async () => {
  const copied: string[] = [];
  const result = await shareLink(
    {
      share: async () => {
        throw new DOMException("Share canceled", "AbortError");
      },
      clipboard: { writeText: async (text) => void copied.push(text) },
    },
    link,
  );
  assert.equal(result, "cancelled");
  assert.deepEqual(copied, []);
});

test("with no share sheet, or a failed one, the link is copied", async () => {
  const copied: string[] = [];
  const clipboard = {
    writeText: async (text: string) => void copied.push(text),
  };
  assert.equal(await shareLink({ clipboard }, link), "copied");
  assert.equal(
    await shareLink(
      {
        share: async () => {
          throw new DOMException("Not allowed", "NotAllowedError");
        },
        clipboard,
      },
      link,
    ),
    "copied",
  );
  assert.deepEqual(copied, [link.url, link.url]);
});

test("with neither, the page learns that it failed", async () => {
  await assert.rejects(shareLink({}, link));
});
