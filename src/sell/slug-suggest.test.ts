import assert from "node:assert/strict";
import { test } from "node:test";
import { slugSchema } from "../../shared/setup.ts";
import { createSlugSuggest } from "./slug-suggest.ts";
import { storeId } from "./test-draft.ts";

function setup(answer: (path: string) => Promise<unknown>) {
  const paths: string[] = [];
  const slugs: string[] = [];
  const suggest = createSlugSuggest({
    api: {
      get: (async (
        path: string,
        schema: { parse(value: unknown): unknown },
      ) => {
        paths.push(path);
        return schema.parse(await answer(path));
      }) as never,
    },
    storeId: () => storeId,
    onSlug: (slug) => slugs.push(slug),
    delayMs: 600,
    madeUp: () => "store-k7m2",
  });
  return { suggest, paths, slugs };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

test("a name in English letters gives its link at once, with no request", () => {
  const { suggest, paths, slugs } = setup(async () => {
    throw new Error("not asked");
  });
  suggest.suggest("Shobha's Kitchen");
  suggest.suggest("  ");
  assert.deepEqual(slugs, ["shobhas-kitchen", ""]);
  assert.deepEqual(paths, []);
});

test("a Hindi name asks the server once after a pause and takes its link", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { suggest, paths, slugs } = setup(async () => ({
    slug: "doosri-dukaan",
    from: "latin",
  }));
  suggest.suggest("दूसरी");
  suggest.suggest("दूसरी दुकान");
  assert.deepEqual(slugs, []);
  t.mock.timers.tick(600);
  await flush();
  assert.deepEqual(paths, [
    `/api/sell/slug-suggestion?name=${encodeURIComponent("दूसरी दुकान")}&store=${storeId}`,
  ]);
  assert.deepEqual(slugs, ["doosri-dukaan"]);
  suggest.suggest("दूसरी दुकान");
  assert.equal(paths.length, 1, "the answer is kept");
  assert.deepEqual(slugs, ["doosri-dukaan", "doosri-dukaan"]);
});

test("with no answer from the server, the link is made up and valid, never empty", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { suggest, slugs } = setup(async () => {
    throw Object.assign(new Error("offline"), { code: "network" });
  });
  suggest.suggest("दूसरी दुकान");
  t.mock.timers.tick(600);
  await flush();
  assert.deepEqual(slugs, ["store-k7m2"]);
  assert.ok(slugSchema.safeParse(slugs[0]).success);
});

test("her own typing stops a suggestion on its way", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { suggest, paths, slugs } = setup(async () => ({
    slug: "doosri-dukaan",
    from: "latin",
  }));
  suggest.suggest("दूसरी दुकान");
  suggest.stop();
  t.mock.timers.tick(600);
  await flush();
  assert.deepEqual(paths, []);
  assert.deepEqual(slugs, []);
});
