import { find } from "../dom/dom.ts";
import type { Text } from "../text/text.ts";
import { stepStates, steps, type Draft, type Step } from "./draft.ts";
import { stepValue } from "./step-values.ts";

export type WizardView = { render(draft: Draft): void };

// The list of steps beside the step card: what each step holds, where she
// is, and which steps she can open. One step card shows at a time.
export function createWizardView({
  nav,
  cards,
  text,
  onOpen,
}: {
  nav: HTMLElement;
  cards: ReadonlyMap<Step, HTMLElement>;
  text: Text;
  onOpen: (step: Step) => void;
}): WizardView {
  let shown: Step | undefined;
  nav.addEventListener("click", (event) => {
    const button =
      event.target instanceof Element
        ? event.target.closest<HTMLButtonElement>("button[data-step]")
        : null;
    const step = steps.find((name) => name === button?.dataset.step);
    if (button !== null && !button.disabled && step !== undefined) onOpen(step);
  });

  return {
    render(draft) {
      for (const { step, state } of stepStates(draft)) {
        const button = find(
          nav,
          `button[data-step="${step}"]`,
          HTMLButtonElement,
        );
        button.dataset.state = state;
        button.disabled =
          state === "locked" || (draft.published !== null && step !== "share");
        if (state === "current") button.setAttribute("aria-current", "step");
        else button.removeAttribute("aria-current");
        find(button, ".step-value", HTMLElement).textContent = stepValue(
          draft,
          step,
          text,
        );
      }
      for (const [step, card] of cards) card.hidden = step !== draft.step;
      if (shown !== undefined && shown !== draft.step) {
        cards
          .get(draft.step)
          ?.querySelector<HTMLElement>("h2[tabindex]")
          ?.focus();
      }
      shown = draft.step;
    },
  };
}
