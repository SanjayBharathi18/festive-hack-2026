import assert from "node:assert/strict";
import { test } from "node:test";
import { markHeard } from "./heard.ts";

const vk1 =
  "ನಮಸ್ಕಾರ, ಶನಿವಾರಕ್ಕೆ ಒಂದು ಕೆಜಿ ಮೈಸೂರು ಪಾಕ್ ಮತ್ತು ಅರ್ಧ ಕೆಜಿ ಚಕ್ಕುಲಿ ಬೇಕು. ನನ್ನ ಹೆಸರು ಪ್ರಿಯಾ, ಜಯನಗರಕ್ಕೆ ಡೆಲಿವರಿ ಮಾಡಿ.";

test("the phrases the model used are marked in the Kannada transcript", () => {
  const parts = markHeard(vk1, [
    "ಒಂದು ಕೆಜಿ ಮೈಸೂರು ಪಾಕ್",
    "ಅರ್ಧ ಕೆಜಿ ಚಕ್ಕುಲಿ",
    "ಪ್ರಿಯಾ",
    "ಜಯನಗರ",
  ]);
  assert.deepEqual(
    parts.filter((part) => part.heard).map((part) => part.text),
    ["ಒಂದು ಕೆಜಿ ಮೈಸೂರು ಪಾಕ್", "ಅರ್ಧ ಕೆಜಿ ಚಕ್ಕುಲಿ", "ಪ್ರಿಯಾ", "ಜಯನಗರ"],
  );
  assert.equal(parts.map((part) => part.text).join(""), vk1);
});

test("Latin words match in any case", () => {
  const parts = markHeard("Saturday ge Mysore pak 2 kg, name Deepa.", [
    "mysore PAK 2 kg",
    "Deepa",
  ]);
  assert.deepEqual(
    parts.filter((part) => part.heard).map((part) => part.text),
    ["Mysore pak 2 kg", "Deepa"],
  );
});

test("a phrase not in the transcript, or inside a longer one, adds no mark", () => {
  const parts = markHeard("Three hundred grams of chakli for tomorrow", [
    "300 grams of chakli",
    "chakli",
    "Three hundred grams of chakli",
    null,
    "",
  ]);
  assert.deepEqual(parts, [
    { text: "Three hundred grams of chakli", heard: true },
    { text: " for tomorrow", heard: false },
  ]);
});

test("a transcript with no phrases is one plain part", () => {
  assert.deepEqual(markHeard("ನಮಸ್ಕಾರ", []), [{ text: "ನಮಸ್ಕಾರ", heard: false }]);
  assert.deepEqual(markHeard("", ["x"]), []);
});
