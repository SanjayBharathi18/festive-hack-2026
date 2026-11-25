import assert from "node:assert/strict";
import { test } from "node:test";
import { blobOfDataUrl, fitWithin, shrinkSteps } from "./photo-size.ts";

test("a photo shrinks to fit its long side, and never grows", () => {
  assert.deepEqual(fitWithin({ width: 4000, height: 3000 }, 1600), {
    width: 1600,
    height: 1200,
  });
  assert.deepEqual(fitWithin({ width: 900, height: 1800 }, 1600), {
    width: 800,
    height: 1600,
  });
  assert.deepEqual(fitWithin({ width: 640, height: 480 }, 1600), {
    width: 640,
    height: 480,
  });
});

test("each shrink step is smaller than the one before", () => {
  for (const [index, step] of shrinkSteps.entries()) {
    const before = shrinkSteps[index - 1];
    if (before === undefined) continue;
    assert.ok(step.side < before.side && step.quality <= before.quality);
  }
});

test("a stored photo becomes a file to upload again", async () => {
  const blob = blobOfDataUrl("data:image/jpeg;base64,/9j/4AAQ");
  assert.equal(blob.type, "image/jpeg");
  assert.deepEqual(
    [...new Uint8Array(await blob.arrayBuffer())],
    [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10],
  );
  assert.throws(() => blobOfDataUrl("data:text/plain,hello"), {
    code: "photo_unreadable",
  });
});
