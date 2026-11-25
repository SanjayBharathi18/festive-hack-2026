import type { Text } from "../text/text.ts";

let made = 0;

// Markup that a module mounts into a page it does not own: the HTML of the
// module, in the page language. Each field gets its own ids, so that its
// label and hint name its control even when the markup shows twice.
export function fromHtml(html: string, text: Pick<Text, "apply">): HTMLElement {
  const template = document.createElement("template");
  template.innerHTML = html.trim();
  text.apply(template.content);
  const root = template.content.firstElementChild;
  if (!(root instanceof HTMLElement)) {
    throw new Error("The markup of the module is empty.");
  }
  for (const nested of root.querySelectorAll("template")) {
    text.apply(nested.content);
  }
  linkFields(root);
  return root;
}

export function linkFields(root: ParentNode): void {
  for (const field of root.querySelectorAll(".field")) {
    const control = field.querySelector("input, select, textarea");
    if (control === null) continue;
    made += 1;
    const id = control.id || `field-${made}`;
    control.id = id;
    field.querySelector("label")?.setAttribute("for", id);
    const hint = field.querySelector(".field-hint");
    if (hint !== null) {
      hint.id = `${id}-hint`;
      control.setAttribute("aria-describedby", hint.id);
    }
  }
}
