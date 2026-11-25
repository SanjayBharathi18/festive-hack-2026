import assert from "node:assert/strict";
import { test } from "node:test";
import { createSampleCache } from "./buffers.ts";

test("the cache stays within its budget and drops the least recently used sound", () => {
  const cache = createSampleCache<number>(10, (samples) => samples);
  cache.set("a", 4);
  cache.set("b", 4);
  assert.equal(cache.get("a"), 4);
  cache.set("c", 4);
  assert.equal(cache.has("b"), false);
  assert.equal(cache.has("a"), true);
  assert.equal(cache.has("c"), true);
  assert.equal(cache.samples, 8);
});

test("a sound set again replaces its old size, and the newest sound always stays", () => {
  const cache = createSampleCache<number>(10, (samples) => samples);
  cache.set("a", 4);
  cache.set("a", 6);
  assert.equal(cache.samples, 6);
  cache.set("big", 20);
  assert.equal(cache.has("a"), false);
  assert.equal(cache.get("big"), 20);
  assert.equal(cache.samples, 20);
});
