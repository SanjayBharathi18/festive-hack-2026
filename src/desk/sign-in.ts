import { phoneSchema } from "../../shared/phone.ts";
import {
  codeSchema,
  verifyCheckAnswerSchema,
  verifyStartAnswerSchema,
} from "../../shared/verify.ts";
import { isAbortError, type Api } from "../api/api.ts";
import type { Wait } from "../wait/wait.ts";

export type SignInStep =
  | { name: "phone"; error: unknown }
  | { name: "code"; phone: string; code: string; error: unknown }
  | { name: "done" };

export type SignIn = {
  readonly step: SignInStep;
  sendPhone(text: string): Promise<void>;
  sendCode(text: string): Promise<void>;
  changeNumber(): void;
};

// Her WhatsApp number, then the code. In this build the server gives the code
// back to the page, which shows it with the Prototype badge.
export function createSignIn({
  api,
  waitFor,
  words,
  onStep,
}: {
  api: Pick<Api, "send">;
  waitFor: (step: "phone" | "code") => Pick<Wait, "run">;
  words: { phone: string; code: string };
  onStep: (step: SignInStep) => void;
}): SignIn {
  let step: SignInStep = { name: "phone", error: undefined };
  const show = (next: SignInStep) => {
    step = next;
    onStep(next);
  };

  return {
    get step() {
      return step;
    },
    async sendPhone(text) {
      const phone = phoneSchema.safeParse(text);
      if (!phone.success) {
        show({ name: "phone", error: localError("phone_invalid") });
        return;
      }
      try {
        const started = await waitFor("phone").run(
          (signal) =>
            api.send(
              "POST",
              "/api/verify/start",
              { phone: phone.data, purpose: "desk" },
              verifyStartAnswerSchema,
              { signal },
            ),
          words.phone,
        );
        show({
          name: "code",
          phone: phone.data,
          code: started.code,
          error: undefined,
        });
      } catch (error) {
        if (!isAbortError(error)) show({ name: "phone", error });
      }
    },
    async sendCode(text) {
      if (step.name !== "code") return;
      const asked = step;
      const code = codeSchema.safeParse(text);
      if (!code.success) {
        show({ ...asked, error: localError("code_invalid") });
        return;
      }
      try {
        await waitFor("code").run(
          (signal) =>
            api.send(
              "POST",
              "/api/verify/check",
              { phone: asked.phone, purpose: "desk", code: code.data },
              verifyCheckAnswerSchema,
              { signal },
            ),
          words.code,
        );
        show({ name: "done" });
      } catch (error) {
        if (!isAbortError(error)) show({ ...asked, error });
      }
    },
    changeNumber() {
      show({ name: "phone", error: undefined });
    },
  };
}

function localError(code: "phone_invalid" | "code_invalid"): Error {
  return Object.assign(new Error(code), { code });
}

// Too many tries: a wait of a minute or more reads in minutes and seconds.
export function longWaitOf(
  error: unknown,
): { minutes: number; seconds: number } | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  if (!("code" in error) || error.code !== "rate_limited") return undefined;
  const params = "params" in error ? error.params : undefined;
  const seconds =
    typeof params === "object" && params !== null && "seconds" in params
      ? params.seconds
      : undefined;
  if (typeof seconds !== "number" || seconds < 60) return undefined;
  return { minutes: Math.floor(seconds / 60), seconds: seconds % 60 };
}
