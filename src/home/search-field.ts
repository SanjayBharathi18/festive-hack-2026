export type SearchKeyAction = "run" | "clear" | "none";

// The parts of the DOM that this module uses, so that it runs under node:test.
type KeyPress = { key: string; isComposing: boolean; preventDefault(): void };
export type SearchFieldParts = {
  input: {
    value: string;
    focus(): void;
    addEventListener(
      type: "keydown",
      listener: (event: KeyPress) => void,
    ): void;
  };
  clear: { addEventListener(type: "click", listener: () => void): void };
};

// The search runs as she types. Enter runs it at once; Escape and the clear
// button empty the box and run it again. The clear button takes the place of
// the browser's own, which does not match the page.
export function bindSearchField(
  { input, clear }: SearchFieldParts,
  onRun: () => void,
): void {
  const empty = () => {
    input.value = "";
    input.focus();
    onRun();
  };
  input.addEventListener("keydown", (event) => {
    const action = searchKeyAction(event.key, input.value, event.isComposing);
    if (action === "none") return;
    event.preventDefault();
    if (action === "clear") empty();
    else onRun();
  });
  clear.addEventListener("click", empty);
}

// While an input method composes a word, Enter and Escape belong to it.
// Escape in an empty box is left to the page.
export function searchKeyAction(
  key: string,
  words: string,
  composing: boolean,
): SearchKeyAction {
  if (composing) return "none";
  if (key === "Enter") return "run";
  if (key === "Escape" && words !== "") return "clear";
  return "none";
}
