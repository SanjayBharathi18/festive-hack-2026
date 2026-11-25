// A missing element is a broken page, so it fails at once with its selector.
export function find<T extends Element>(
  root: ParentNode,
  selector: string,
  type: abstract new () => T,
): T {
  const found = root.querySelector(selector);
  if (!(found instanceof type)) {
    throw new Error(`The page has no ${type.name} at ${selector}.`);
  }
  return found;
}

export function cloneTemplate(template: HTMLTemplateElement): HTMLElement {
  const node = template.content.firstElementChild?.cloneNode(true);
  if (!(node instanceof HTMLElement)) {
    throw new Error(`The template #${template.id} is empty.`);
  }
  return node;
}
