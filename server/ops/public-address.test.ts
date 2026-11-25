import assert from "node:assert/strict";
import { test } from "node:test";
import { publicAddress } from "./public-address.ts";

test("a public address keeps the origin and the path only", () => {
  assert.equal(
    publicAddress("https://user:secret@proxy.example/api/v1/?key=abc#top"),
    "https://proxy.example/api/v1/",
  );
  assert.equal(
    publicAddress("https://api.sarvam.ai"),
    "https://api.sarvam.ai/",
  );
});
