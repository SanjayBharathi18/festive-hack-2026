import type { Api } from "../api/api.ts";
import { find } from "../dom/dom.ts";
import type { Text } from "../text/text.ts";
import { createWait } from "../wait/wait.ts";
import type { Draft, Published } from "./draft.ts";
import { createPublishFlow, type PublishStep } from "./publish-flow.ts";

export type PublishView = { show(draft: Draft): void };

// The publish step: her number and the two agreements, then the code that
// this prototype shows with its badge, then Publish.
export function createPublishView({
  root,
  api,
  text,
  draft,
  onPhone,
  adopt,
  onPublished,
  onSlugTaken,
}: {
  root: HTMLElement;
  api: Pick<Api, "send">;
  text: Text;
  draft: () => Draft;
  onPhone: (phone: string) => void;
  adopt: (storeId: string) => void;
  onPublished: (published: Published) => void;
  onSlugTaken: () => void;
}): PublishView {
  const el = (selector: string) => find(root, selector, HTMLElement);
  const phoneForm = find(root, "#phone-form", HTMLFormElement);
  const codeForm = find(root, "#code-form", HTMLFormElement);
  const phone = find(root, "#phone", HTMLInputElement);
  const code = find(root, "#code", HTMLInputElement);
  const retry = find(root, "#retry", HTMLButtonElement);
  const waits = {
    phone: createWait({
      control: find(phoneForm, "button[type=submit]", HTMLButtonElement),
      line: root.querySelector("#phone-wait"),
    }),
    code: createWait({
      control: find(codeForm, "button[type=submit]", HTMLButtonElement),
      line: root.querySelector("#code-wait"),
    }),
    retry: createWait({
      control: retry,
      line: root.querySelector("#retry-wait"),
    }),
  };

  const showError = (
    field: HTMLInputElement,
    line: HTMLElement,
    error: unknown,
  ) => {
    const words = error === undefined ? "" : text.error(error, "sell");
    line.textContent = words;
    line.hidden = words === "";
    if (words === "") field.removeAttribute("aria-invalid");
    else field.setAttribute("aria-invalid", "true");
  };

  const render = (step: PublishStep) => {
    phoneForm.hidden = step.name !== "phone";
    codeForm.hidden = step.name !== "code";
    el("#publish-retry").hidden = step.name !== "retry";
    el("#has-store").hidden = step.name !== "has_store";
    switch (step.name) {
      case "phone":
        showError(phone, el("#phone-error"), step.error);
        if (step.error !== undefined) phone.focus();
        return;
      case "code":
        el("#code-shown").textContent = step.code;
        if (code.value === "" || step.error === undefined)
          code.value = step.code;
        showError(code, el("#code-error"), step.error);
        code.focus();
        return;
      case "retry":
        el("#retry-error").textContent = text.error(step.error, "sell.upload");
        retry.focus();
        return;
      case "has_store":
        el("#has-store-name").textContent = step.store.name;
        return;
      case "slug_taken":
        flow.changeNumber();
        onSlugTaken();
        return;
      case "done":
        onPublished(step.published);
        return;
    }
  };

  const flow = createPublishFlow({
    api,
    waitFor: (step) => waits[step],
    words: {
      phone: text.t("sell.publish.getting_code"),
      publishing: text.t("sell.publish.publishing"),
    },
    draft,
    adopt,
    onStep: render,
  });

  phone.addEventListener("input", () => onPhone(phone.value));
  phoneForm.addEventListener("submit", (event) => {
    event.preventDefault();
    void flow.sendPhone(phone.value);
  });
  codeForm.addEventListener("submit", (event) => {
    event.preventDefault();
    void flow.sendCode(code.value);
  });
  retry.addEventListener("click", () => void flow.retry());
  for (const selector of ["#change-number", "#other-number"]) {
    find(root, selector, HTMLButtonElement).addEventListener("click", () => {
      code.value = "";
      flow.changeNumber();
      phone.focus();
    });
  }

  return {
    show(current) {
      if (phone.value === "") phone.value = current.phone;
      render(flow.step);
    },
  };
}
