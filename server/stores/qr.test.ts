import assert from "node:assert/strict";
import { test } from "node:test";
import { qrSvg, storeUrl } from "./qr.ts";

test("the store link is the public address and the slug", () => {
  assert.equal(
    storeUrl("https://34-12-56-78.sslip.io", "shobhas-kitchen"),
    "https://34-12-56-78.sslip.io/s/shobhas-kitchen",
  );
});

test("the QR code is an SVG in ink on paper, the same for the same link", async () => {
  const svg = await qrSvg("https://34-12-56-78.sslip.io/s/shobhas-kitchen");
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.match(svg, /fill="#faf6ee"/);
  assert.match(svg, /stroke="#1f1a16"/);
  assert.equal(
    await qrSvg("https://34-12-56-78.sslip.io/s/shobhas-kitchen"),
    svg,
  );
  assert.notEqual(await qrSvg("https://34-12-56-78.sslip.io/s/other"), svg);
});
