import assert from "node:assert/strict";
import { test } from "node:test";
import { bindSearchField, searchKeyAction } from "./search-field.ts";

test("Enter runs the search at once, even in an empty box", () => {
  assert.equal(searchKeyAction("Enter", "kaju katli", false), "run");
  assert.equal(searchKeyAction("Enter", "", false), "run");
});

test("Escape empties a box with words, and leaves an empty box to the page", () => {
  assert.equal(searchKeyAction("Escape", "kaju katli", false), "clear");
  assert.equal(searchKeyAction("Escape", "", false), "none");
});

test("while an input method composes a word, Enter and Escape belong to it", () => {
  assert.equal(searchKeyAction("Enter", "ಕಾಜು", true), "none");
  assert.equal(searchKeyAction("Escape", "ಕಾಜು", true), "none");
  assert.equal(searchKeyAction("a", "kaju", false), "none");
});

test("Escape and the clear button empty the box, keep the focus in it and run the search", () => {
  let press: (event: {
    key: string;
    isComposing: boolean;
    preventDefault(): void;
  }) => void = () => {};
  let click = () => {};
  let focused = 0;
  let runs = 0;
  const input = {
    value: "kaju katli",
    focus: () => void focused++,
    addEventListener: (_type: "keydown", listener: typeof press) => {
      press = listener;
    },
  };
  bindSearchField(
    {
      input,
      clear: {
        addEventListener: (_type: "click", listener: () => void) => {
          click = listener;
        },
      },
    },
    () => void runs++,
  );

  let prevented = 0;
  const key = (name: string) =>
    press({
      key: name,
      isComposing: false,
      preventDefault: () => void prevented++,
    });
  key("Escape");
  assert.deepEqual([input.value, focused, runs, prevented], ["", 1, 1, 1]);
  key("Escape");
  assert.deepEqual([runs, prevented], [1, 1]);

  input.value = "laddu";
  key("Enter");
  assert.deepEqual([input.value, runs, prevented], ["laddu", 2, 2]);

  click();
  assert.deepEqual([input.value, focused, runs], ["", 2, 3]);
});
