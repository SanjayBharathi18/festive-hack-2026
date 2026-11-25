import assert from "node:assert/strict";
import { test } from "node:test";
import {
  maxPartBytes,
  maxParts,
  maxPartSeconds,
} from "../../shared/reading.ts";
import {
  lengthProblem,
  maxPartSamples,
  partSeconds,
  sourceSeconds,
  wavRate,
} from "./limits.ts";

test("a part is 29 s or less and 1 MB or less", () => {
  assert.equal(partSeconds, 29);
  assert.ok(partSeconds < maxPartSeconds);
  assert.ok(maxPartSamples <= partSeconds * wavRate);
  assert.ok(44 + 2 * maxPartSamples <= maxPartBytes);
});

test("5 minutes fit in the parts that the server takes", () => {
  assert.ok(Math.ceil((sourceSeconds * wavRate) / maxPartSamples) <= maxParts);
});

test("lengthProblem refuses more than 5 minutes and less than half a second", () => {
  assert.equal(lengthProblem(0.2), "too_short");
  assert.equal(lengthProblem(0.5), undefined);
  assert.equal(lengthProblem(300), undefined);
  assert.equal(lengthProblem(300.6), undefined);
  assert.equal(lengthProblem(301.5), "too_long");
});
