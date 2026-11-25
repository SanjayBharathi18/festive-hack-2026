import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createSoundSetting,
  parseSetting,
  settingKey,
  type KeyValueStore,
} from "./setting.ts";

test("sound and vibration are on by default", () => {
  assert.equal(createSoundSetting(memoryStore()).on, true);
  assert.equal(createSoundSetting(undefined).on, true);
});

test("the choice is kept across a reload", () => {
  const store = memoryStore();
  createSoundSetting(store).set(false);
  assert.equal(store.getItem(settingKey), "off");
  const reloaded = createSoundSetting(store);
  assert.equal(reloaded.on, false);
  reloaded.set(true);
  assert.equal(createSoundSetting(store).on, true);
});

test("a change in another tab shows at once", () => {
  const store = memoryStore();
  const setting = createSoundSetting(store);
  store.setItem(settingKey, "off");
  assert.equal(setting.on, false);
});

test("a stored value that is not on or off reads as the default", () => {
  const store = memoryStore();
  store.setItem(settingKey, "loud");
  assert.equal(createSoundSetting(store).on, true);
  assert.equal(parseSetting(null), undefined);
  assert.equal(parseSetting("on"), true);
  assert.equal(parseSetting("off"), false);
});

test("without storage, the choice holds for the page and the failure is logged", () => {
  const reports: string[] = [];
  const broken: KeyValueStore = {
    getItem() {
      throw new Error("blocked");
    },
    setItem() {
      throw new Error("blocked");
    },
  };
  const setting = createSoundSetting(broken, (message) =>
    reports.push(message),
  );
  assert.equal(setting.on, true);
  setting.set(false);
  assert.equal(setting.on, false);
  assert.equal(reports.length, 1);
});

function memoryStore(): KeyValueStore {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
}
