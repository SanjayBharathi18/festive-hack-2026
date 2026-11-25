import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export type SetupResult = {
  created: boolean;
  filled: string[];
  port: string;
  demoToken: string;
};

export function runSetup({
  envPath = ".env",
  examplePath = ".env.example",
  secret = () => randomBytes(32).toString("base64url"),
}: {
  envPath?: string;
  examplePath?: string;
  secret?: () => string;
} = {}): SetupResult {
  const created = !existsSync(envPath);
  const before = created
    ? readFileSync(examplePath, "utf8")
    : readFileSync(envPath, "utf8");
  const port = readValue(before, "PORT") || "8080";
  const wanted: Record<string, string> = {
    SESSION_SECRET: secret(),
    DEMO_DESK_TOKEN: secret(),
  };
  if (created) {
    wanted.HOST = "127.0.0.1";
    wanted.PUBLIC_URL = `http://localhost:${port}`;
  }
  const { text, filled } = fillEmpty(before, wanted, created);
  writeFileSync(envPath, text, { mode: 0o600 });
  return {
    created,
    filled,
    port,
    demoToken: readValue(text, "DEMO_DESK_TOKEN"),
  };
}

export function fillEmpty(
  text: string,
  wanted: Record<string, string>,
  replaceAll: boolean,
): { text: string; filled: string[] } {
  const filled: string[] = [];
  const seen = new Set<string>();
  const lines = text.split("\n").map((line) => {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line);
    const key = match?.[1];
    if (key === undefined || !(key in wanted)) return line;
    seen.add(key);
    const empty = (match?.[2] ?? "").trim() === "";
    if (!empty && !replaceAll) return line;
    filled.push(key);
    return `${key}=${wanted[key]}`;
  });
  for (const key of Object.keys(wanted)) {
    if (seen.has(key)) continue;
    filled.push(key);
    lines.push(`${key}=${wanted[key]}`);
  }
  return { text: lines.join("\n"), filled };
}

export function readValue(text: string, key: string): string {
  const line = text.split("\n").find((entry) => entry.startsWith(`${key}=`));
  return line === undefined ? "" : line.slice(key.length + 1).trim();
}

function main(): void {
  const result = runSetup();
  const base = `http://localhost:${result.port}`;
  console.log(
    [
      result.created
        ? "The setup made the file .env with new secrets."
        : `The setup kept your file .env. It filled: ${result.filled.join(", ") || "nothing"}.`,
      "",
      ...(process.env.START_LOCAL
        ? ["The app starts now. To stop it, push Ctrl+C."]
        : ["Do this next:", "  npm run serve"]),
      "",
      "Then open these addresses in Chrome:",
      `  Homepage:   ${base}/`,
      `  Storefront: ${base}/s/shobhas-kitchen`,
      `  Demo desk:  ${base}/desk?demo=${result.demoToken}&lang=en`,
    ].join("\n"),
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();
