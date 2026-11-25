import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { test } from "node:test";
import { parseIcon, readIcons, sprite } from "./icons.ts";

const root = new URL("../", import.meta.url);
const lineSettings =
  'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"';
const stop = `<svg xmlns="http://www.w3.org/2000/svg" ${lineSettings}>
  <path d="M5 12h14" />
  <rect x="6" y="6" width="12" height="12" rx="2.5" style="fill: var(--icon-fill, #eadcc2)" />
  <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
</svg>
`;

test("an icon keeps its drawing and its line settings", () => {
  const icon = parseIcon("stop", stop);
  assert.equal(icon.name, "stop");
  assert.equal(icon.attributes, lineSettings);
  assert.deepEqual(icon.shapes, [
    '<path d="M5 12h14"/>',
    '<rect x="6" y="6" width="12" height="12" rx="2.5" style="fill: var(--icon-fill, #eadcc2)"/>',
    '<circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/>',
  ]);
});

test("an icon that page CSS would have to colour is refused", () => {
  const cases = [
    ["a class", stop.replace("<path ", '<path class="i-line" ')],
    ["an id", stop.replace("<path ", '<path id="line" ')],
    [
      "a raw stroke colour",
      stop.replace('stroke="currentColor"', 'stroke="#1f1a16"'),
    ],
    [
      "a raw fill colour",
      stop.replace('fill="currentColor"', 'fill="#1f1a16"'),
    ],
    [
      "a fill that is not a token",
      stop.replace("var(--icon-fill, #eadcc2)", "#eadcc2"),
    ],
    [
      "a style element",
      stop.replace("<path ", "<style>path { stroke: red }</style><path "),
    ],
    [
      "a group",
      stop.replace("<path ", "<g><path ").replace("</svg>", "</g></svg>"),
    ],
    ["another viewBox", stop.replace("0 0 24 24", "0 0 16 16")],
    ["no namespace", stop.replace(' xmlns="http://www.w3.org/2000/svg"', "")],
    ["a size on the root", stop.replace("<svg ", '<svg width="24" ')],
    ["an attribute set twice", stop.replace('rx="2.5"', 'rx="2.5" rx="3"')],
    [
      "no shapes",
      `<svg xmlns="http://www.w3.org/2000/svg" ${lineSettings}></svg>`,
    ],
  ];
  for (const [why, source = ""] of cases)
    assert.throws(() => parseIcon("stop", source), Error, why);
  assert.throws(() => parseIcon("Stop Icon", stop), /name the file/);
});

test("the sprite has one symbol for each icon, with the file name as its id", () => {
  const plus = stop.replace(/<rect[^>]*>\n|<circle[^>]*>\n/g, "");
  const svg = sprite([parseIcon("plus", plus), parseIcon("stop", stop)]);
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg">\n/);
  assert.deepEqual(
    [...svg.matchAll(/<symbol id="([^"]+)" ([^>]*)>/g)].map(
      ([, id, attributes]) => [id, attributes],
    ),
    [
      ["plus", lineSettings],
      ["stop", lineSettings],
    ],
  );
  assert.equal(svg.includes("class="), false);
});

test("every icon in src/icons reads, and its fallbacks are the brass tint and the paper", async () => {
  const tokens = await readFile(new URL("src/styles/tokens.css", root), "utf8");
  const token = (name: string) =>
    tokens.match(new RegExp(`--${name}: (#[0-9a-f]{6});`))?.[1];
  const fallbacks = new Map([
    ["fill", token("brass-tint")],
    ["ground", token("paper")],
  ]);
  const icons = await readIcons();
  assert.ok(icons.length > 0);
  for (const icon of icons) {
    for (const shape of icon.shapes) {
      for (const [, role = "", colour] of shape.matchAll(
        /var\(--icon-(fill|ground), (#[0-9a-f]{6})\)/g,
      )) {
        assert.equal(
          colour,
          fallbacks.get(role),
          `${icon.name}.svg: the --icon-${role} fallback is not the token`,
        );
      }
    }
  }
});

test("src/public/icons.svg is built from src/icons", async () => {
  const built = await readFile(new URL("src/public/icons.svg", root), "utf8");
  assert.equal(built, sprite(await readIcons()), "Run node scripts/icons.ts");
});

test("each icon that a page uses is in the sprite", async () => {
  const names = new Set((await readIcons()).map((icon) => icon.name));
  const files = (await readdir(new URL("src/", root), { recursive: true }))
    .filter((file) => /\.(html|ts)$/.test(file))
    .map((file) => `src/${file}`)
    .concat("extra/components.html");
  for (const file of files) {
    const text = await readFile(new URL(file, root), "utf8");
    for (const [, name = ""] of text.matchAll(/icons\.svg#([\w-]+)/g)) {
      assert.ok(
        names.has(name),
        `${file} uses icons.svg#${name}, which src/icons does not have`,
      );
    }
  }
});
