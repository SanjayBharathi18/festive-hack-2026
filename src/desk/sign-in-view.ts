import type { Api } from "../api/api.ts";
import type { Text } from "../text/text.ts";
import { createWait } from "../wait/wait.ts";
import { createSignIn, longWaitOf, type SignInStep } from "./sign-in.ts";

export type SignInView = { show(demoRefused: boolean): void };

// The sign-in of her desk: the number, then the code, which this build shows on
// the screen with the Prototype badge and puts in the code field for her.
export function createSignInView({
  root,
  api,
  text,
  onSignedIn,
}: {
  root: HTMLElement;
  api: Pick<Api, "send">;
  text: Text;
  onSignedIn: () => void;
}): SignInView {
  const phoneForm = part<HTMLFormElement>(root, "#phone-form");
  const codeForm = part<HTMLFormElement>(root, "#code-form");
  const phone = part<HTMLInputElement>(root, "#phone");
  const code = part<HTMLInputElement>(root, "#code");
  const phoneError = part(root, "#phone-error");
  const codeError = part(root, "#code-error");
  const waits = {
    phone: createWait({
      control: part(phoneForm, "button[type=submit]"),
      line: root.querySelector("#phone-wait"),
    }),
    code: createWait({
      control: part(codeForm, "button[type=submit]"),
      line: root.querySelector("#code-wait"),
    }),
  };

  const showError = (
    field: HTMLInputElement,
    line: HTMLElement,
    error: unknown,
  ) => {
    const wait = longWaitOf(error);
    const words =
      error === undefined
        ? ""
        : wait === undefined
          ? text.error(error, "desk")
          : text.t("desk.sign_in.wait_minutes", wait);
    line.textContent = words;
    line.hidden = words === "";
    if (words === "") field.removeAttribute("aria-invalid");
    else field.setAttribute("aria-invalid", "true");
  };

  const render = (step: SignInStep) => {
    phoneForm.hidden = step.name !== "phone";
    codeForm.hidden = step.name !== "code";
    if (step.name === "phone") {
      showError(phone, phoneError, step.error);
      if (step.error !== undefined) phone.focus();
    }
    if (step.name === "code") {
      part(root, "#code-shown").textContent = step.code;
      if (code.value === "" || step.error === undefined) code.value = step.code;
      showError(code, codeError, step.error);
      code.focus();
    }
    if (step.name === "done") onSignedIn();
  };

  const signIn = createSignIn({
    api,
    waitFor: (step) => waits[step],
    words: {
      phone: text.t("desk.sign_in.getting_code"),
      code: text.t("desk.sign_in.opening"),
    },
    onStep: render,
  });

  phoneForm.addEventListener("submit", (event) => {
    event.preventDefault();
    void signIn.sendPhone(phone.value);
  });
  codeForm.addEventListener("submit", (event) => {
    event.preventDefault();
    void signIn.sendCode(code.value);
  });
  part(root, "#change-number").addEventListener("click", () => {
    code.value = "";
    signIn.changeNumber();
    phone.focus();
  });

  return {
    show(demoRefused) {
      const notice = part(root, "#sign-in-demo");
      notice.textContent = demoRefused ? text.t("desk.error.demo_link") : "";
      notice.hidden = !demoRefused;
      root.hidden = false;
      render(signIn.step);
      phone.focus();
    },
  };
}

function part<T extends HTMLElement = HTMLElement>(
  root: ParentNode,
  selector: string,
): T {
  const found = root.querySelector<T>(selector);
  if (found === null) throw new Error(`The sign-in has no ${selector}.`);
  return found;
}
