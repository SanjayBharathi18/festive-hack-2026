import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";

export type Icon = { name: string; attributes: string; shapes: string[] };

const iconsDir = new URL("../src/icons/", import.meta.url);
const publicDir = new URL("../src/public/", import.meta.url);
const spriteFile = new URL("icons.svg", publicDir);
const svgNamespace = "http://www.w3.org/2000/svg";
const rootNames = [
  "xmlns",
  "viewBox",
  "fill",
  "stroke",
  "stroke-width",
  "stroke-linecap",
  "stroke-linejoin",
];
const shapeTags = new Set([
  "path",
  "rect",
  "circle",
  "ellipse",
  "line",
  "polyline",
  "polygon",
]);
const paints = new Set(["none", "currentColor"]);
const tokenFill = /^fill: var\(--icon-(fill|ground), #[0-9a-f]{6}\)$/;
const shapePattern = /<(\w+)\s([^<>]*?)\s*\/>/g;

if (import.meta.main) {
  const icons = await readIcons();
  await mkdir(publicDir, { recursive: true });
  await writeFile(spriteFile, sprite(icons));
  console.log(
    `src/public/icons.svg: ${icons.length} icons (${icons.map((icon) => icon.name).join(", ")})`,
  );
}

export async function readIcons(dir: URL = iconsDir): Promise<Icon[]> {
  const files = (await readdir(dir))
    .filter((file) => file.endsWith(".svg"))
    .sort();
  return Promise.all(
    files.map(async (file) =>
      parseIcon(
        file.slice(0, -".svg".length),
        await readFile(new URL(file, dir), "utf8"),
      ),
    ),
  );
}

export function parseIcon(name: string, source: string): Icon {
  const fail = (problem: string): never => {
    throw new Error(`src/icons/${name}.svg: ${problem}`);
  };
  if (!/^[a-z][a-z0-9-]*$/.test(name))
    fail(
      "name the file by the job of the icon, in lowercase, for example cart.svg",
    );
  const root = source.trim().match(/^<svg\s([^<>]*)>([\s\S]*)<\/svg>$/);
  if (!root) return fail("the file must be one <svg> element");
  const rootAttributes = parseAttributes(root[1] ?? "", fail);
  if (rootAttributes.get("xmlns") !== svgNamespace)
    fail(`the <svg> needs xmlns="${svgNamespace}"`);
  if (rootAttributes.get("viewBox") !== "0 0 24 24")
    fail('the drawing is 24 px: use viewBox="0 0 24 24"');
  for (const key of rootAttributes.keys()) {
    if (!rootNames.includes(key))
      fail(`the <svg> may set only ${rootNames.join(", ")}, not ${key}`);
  }
  checkPaint(rootAttributes, fail);

  const body = root[2] ?? "";
  const leftover = body.replace(shapePattern, "").replace(/\s+/g, " ").trim();
  if (leftover)
    fail(
      `only self-closing shapes may sit inside the <svg>, not ${leftover.slice(0, 40)}`,
    );
  const shapes = [...body.matchAll(shapePattern)].map(
    ([, tag = "", attributeSource = ""]) => {
      if (!shapeTags.has(tag))
        fail(`<${tag}> is not a shape (${[...shapeTags].join(", ")})`);
      const attributes = parseAttributes(attributeSource, fail);
      for (const key of attributes.keys()) {
        if (key === "class" || key === "id" || key.startsWith("on")) {
          fail(
            `<${tag}> has ${key}: page CSS does not reach into a <use>, so set the line and fill on the shape`,
          );
        }
      }
      checkPaint(attributes, fail);
      return `<${tag} ${serialise(attributes)}/>`;
    },
  );
  if (shapes.length === 0) fail("the <svg> has no shapes");
  rootAttributes.delete("xmlns");
  return { name, attributes: serialise(rootAttributes), shapes };
}

export function sprite(icons: Icon[]): string {
  return [
    `<svg xmlns="${svgNamespace}">`,
    "<!-- Built by scripts/icons.ts from src/icons/*.svg. Edit those files, then run: node scripts/icons.ts -->",
    ...icons.map(
      (icon) =>
        `<symbol id="${icon.name}" ${icon.attributes}>${icon.shapes.join("")}</symbol>`,
    ),
    "</svg>",
    "",
  ].join("\n");
}

function checkPaint(
  attributes: Map<string, string>,
  fail: (problem: string) => never,
): void {
  for (const key of ["fill", "stroke"]) {
    const value = attributes.get(key);
    if (value !== undefined && !paints.has(value))
      fail(`${key}="${value}": use none or currentColor`);
  }
  const style = attributes.get("style");
  if (style !== undefined && !tokenFill.test(style)) {
    fail(
      `style="${style}": the only style is fill: var(--icon-fill, …) or fill: var(--icon-ground, …)`,
    );
  }
}

function parseAttributes(
  source: string,
  fail: (problem: string) => never,
): Map<string, string> {
  const attributes = new Map<string, string>();
  const pattern = /\s*([\w:-]+)="([^"]*)"/y;
  let end = 0;
  for (let match = pattern.exec(source); match; match = pattern.exec(source)) {
    const [, key = "", value = ""] = match;
    if (attributes.has(key)) fail(`${key} is set twice`);
    attributes.set(key, value);
    end = pattern.lastIndex;
  }
  const rest = source.slice(end).trim();
  if (rest) fail(`cannot read the attributes near ${rest.slice(0, 40)}`);
  return attributes;
}

function serialise(attributes: Map<string, string>): string {
  return [...attributes].map(([key, value]) => `${key}="${value}"`).join(" ");
}
