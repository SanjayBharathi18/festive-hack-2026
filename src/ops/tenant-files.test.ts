import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";

const root = new URL("../../", import.meta.url);
const page = readFileSync(new URL("src/ops/index.html", root), "utf8");
const listed = (id: string) => {
  const list = page.slice(
    page.indexOf(`id="${id}"`),
    page.indexOf("</ul>", page.indexOf(`id="${id}"`)),
  );
  return [
    ...list.matchAll(
      /<code>([^<]+)<\/code>(?:\s*<span class="badge">(\w+)<\/span>)?/g,
    ),
  ].map(([, name, severity]) =>
    severity === undefined ? name : `${name} ${severity}`,
  );
};

test("the console lists each alert rule of deploy/ with its severity", () => {
  const rules = readFileSync(
    new URL("deploy/prometheus-rules.yaml", root),
    "utf8",
  );
  const alerts = [
    ...rules.matchAll(/- alert: (\w+)[\s\S]*?severity: (\w+)/g),
  ].map(([, name, severity]) => `${name} ${severity}`);
  assert.ok(alerts.length > 0);
  assert.deepEqual(listed("alert-rules"), alerts);
});

test("the console lists each workflow file of nudgebee/", () => {
  const files = readdirSync(new URL("nudgebee/", root))
    .filter((name) => name.endsWith(".yaml"))
    .sort();
  assert.deepEqual(listed("workflow-files").sort(), files);
});
