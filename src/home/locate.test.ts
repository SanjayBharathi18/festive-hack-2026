import assert from "node:assert/strict";
import { test } from "node:test";
import { isLocateError, locate, type PositionSource } from "./locate.ts";

const source = (
  answer: { latitude: number; longitude: number } | { code: number },
): PositionSource => ({
  getCurrentPosition(found, failed) {
    if ("code" in answer) failed(answer);
    else found({ coords: answer });
  },
});

test("the place comes back rounded to about 100 m", async () => {
  assert.deepEqual(
    await locate(source({ latitude: 12.912345, longitude: 77.644678 })),
    { lat: 12.912, lng: 77.645 },
  );
});

test("a refused permission and other failures say what happened", async () => {
  await assert.rejects(locate(source({ code: 1 })), (error) => {
    assert.ok(isLocateError(error));
    assert.equal(error.code, "denied");
    return true;
  });
  await assert.rejects(locate(source({ code: 3 })), (error) => {
    assert.ok(isLocateError(error));
    assert.equal(error.code, "failed");
    return true;
  });
  await assert.rejects(locate(undefined), (error) => {
    assert.ok(isLocateError(error) && error.code === "failed");
    return true;
  });
});

test("leaving the page stops the wait", async () => {
  const controller = new AbortController();
  const waiting = locate(
    { getCurrentPosition() {} },
    { signal: controller.signal },
  );
  controller.abort(new DOMException("Left.", "AbortError"));
  await assert.rejects(waiting, { name: "AbortError" });
});
