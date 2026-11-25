import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  createPhotos,
  photoKindOf,
  photoMediaType,
  photoNameOf,
  photoUrl,
} from "./photos.ts";

const storeId = "6f0c2a4e-8f7b-4b8e-9a51-2d3c4b5a6f70";
const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xdb, 1, 2, 3]);

test("the kind of a photo comes from its first bytes", () => {
  assert.equal(photoKindOf(jpeg), "jpg");
  assert.equal(
    photoKindOf(
      Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    ),
    "png",
  );
  const webp = new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 ");
  assert.equal(photoKindOf(webp), "webp");
  assert.equal(photoKindOf(new TextEncoder().encode("GIF89a")), undefined);
  assert.equal(photoKindOf(new Uint8Array()), undefined);
});

test("a photo address gives back only a photo name", () => {
  const name = `${storeId}-0a1b2c3d.jpg`;
  assert.equal(photoUrl(name), `/api/photos/${name}`);
  assert.equal(photoNameOf(photoUrl(name)), name);
  assert.equal(photoNameOf(null), undefined);
  assert.equal(photoNameOf("/api/photos/../app.db"), undefined);
  assert.equal(photoNameOf("https://example.com/a.jpg"), undefined);
  assert.equal(photoMediaType(name), "image/jpeg");
  assert.equal(photoMediaType("x.webp"), "image/webp");
  assert.equal(photoMediaType("x.svg"), undefined);
});

test("photos are saved with a new name, read back and removed", async (t) => {
  const folder = join(mkdtempSync(join(tmpdir(), "photos-")), "photos");
  t.after(() => rmSync(join(folder, ".."), { recursive: true, force: true }));
  const photos = createPhotos(folder);
  const first = await photos.save(storeId, jpeg, "jpg");
  const second = await photos.save(storeId, jpeg, "jpg");
  assert.notEqual(first, second);
  assert.match(first, new RegExp(`^${storeId}-[0-9a-f]{8}\\.jpg$`));
  assert.deepEqual(new Uint8Array((await photos.read(first)) ?? []), jpeg);
  await photos.remove(first);
  assert.equal(existsSync(join(folder, first)), false);
  assert.equal(await photos.read(first), undefined);
  assert.equal(await photos.read("../../etc/passwd"), undefined);
  await photos.remove("../app.db");
});
