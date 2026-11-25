import assert from "node:assert/strict";
import { test } from "node:test";
import { distanceKm } from "./geo.ts";

test("the distance between two places, in kilometres", () => {
  const basavanagudi = { lat: 12.9417, lng: 77.5755 };
  const hsr = { lat: 12.9116, lng: 77.6474 };
  const km = distanceKm(basavanagudi, hsr);
  assert.ok(km > 8 && km < 8.5, String(km));
  assert.equal(distanceKm(basavanagudi, basavanagudi), 0);
  const mumbai = { lat: 19.076, lng: 72.8777 };
  const pune = { lat: 18.5204, lng: 73.8567 };
  const far = distanceKm(mumbai, pune);
  assert.ok(far > 118 && far < 122, String(far));
});
