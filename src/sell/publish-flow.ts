import { phoneSchema } from "../../shared/phone.ts";
import {
  coverAnswerSchema,
  publishAnswerSchema,
  setupStateSchema,
} from "../../shared/setup.ts";
import {
  codeSchema,
  verifyCheckAnswerSchema,
  verifyStartAnswerSchema,
} from "../../shared/verify.ts";
import { isAbortError, type Api } from "../api/api.ts";
import type { Wait } from "../wait/wait.ts";
import { storeBody, type Draft, type Published } from "./draft.ts";
import { blobOfDataUrl } from "./photo-size.ts";

export type PublishStep =
  | { name: "phone"; error: unknown }
  | { name: "code"; phone: string; code: string; error: unknown }
  | { name: "retry"; error: unknown }
  | { name: "has_store"; store: { slug: string; name: string } }
  | { name: "slug_taken" }
  | { name: "done"; published: Published };

export type PublishFlow = {
  readonly step: PublishStep;
  sendPhone(text: string): Promise<void>;
  sendCode(text: string): Promise<void>;
  retry(): Promise<void>;
  changeNumber(): void;
};

type WaitStep = "phone" | "code" | "retry";

// Publish: her WhatsApp number, the code that this build shows on the screen,
// then her store goes to the server and becomes public. The code signs her
// in, so a failed upload is tried again without a new code.
export function createPublishFlow({
  api,
  waitFor,
  words,
  draft,
  adopt,
  onStep,
}: {
  api: Pick<Api, "send">;
  waitFor: (step: WaitStep) => Pick<Wait, "run">;
  words: { phone: string; publishing: string };
  draft: () => Draft;
  adopt: (storeId: string) => void;
  onStep: (step: PublishStep) => void;
}): PublishFlow {
  let step: PublishStep = { name: "phone", error: undefined };
  const show = (next: PublishStep) => {
    step = next;
    onStep(next);
  };

  const upload = async (signal: AbortSignal): Promise<Published> => {
    const current = draft();
    const path = `/api/desk/stores/${current.store_id}`;
    const options = { signal };
    await api
      .send("PUT", path, storeBody(current), setupStateSchema, options)
      .catch((error: unknown) => {
        throw statusOf(error) === 409
          ? Object.assign(new Error("slug_taken"), { code: "slug_taken" })
          : error;
      });
    await api.send(
      "PUT",
      `${path}/items`,
      { items: current.items },
      setupStateSchema,
      options,
    );
    if (current.photo === null) {
      await api.send(
        "DELETE",
        `${path}/cover`,
        undefined,
        coverAnswerSchema,
        options,
      );
    } else {
      await api.send(
        "PUT",
        `${path}/cover`,
        blobOfDataUrl(current.photo),
        coverAnswerSchema,
        options,
      );
    }
    const answer = await api.send(
      "POST",
      `${path}/publish`,
      { whatsapp_updates: true, food_safety: true },
      publishAnswerSchema,
      options,
    );
    return {
      slug: answer.store.slug,
      name: answer.store.name,
      url: answer.url,
    };
  };

  const publish = async (waitStep: WaitStep) => {
    try {
      const published = await waitFor(waitStep).run(
        (signal) => upload(signal),
        words.publishing,
      );
      show({ name: "done", published });
    } catch (error) {
      if (isAbortError(error)) return;
      const code = codeOf(error);
      if (code === "slug_taken") show({ name: "slug_taken" });
      else if (code === "not_signed_in") show({ name: "phone", error });
      else show({ name: "retry", error });
    }
  };

  const check = async (
    asked: Extract<PublishStep, { name: "code" }>,
    code: string,
  ) => {
    try {
      const answer = await waitFor("code").run(
        (signal) =>
          api.send(
            "POST",
            "/api/verify/check",
            { phone: asked.phone, purpose: "publish", code },
            verifyCheckAnswerSchema,
            { signal },
          ),
        words.publishing,
      );
      return answer.purpose === "publish" ? answer : undefined;
    } catch (error) {
      if (!isAbortError(error)) show({ ...asked, error });
      return undefined;
    }
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
              { phone: phone.data, purpose: "publish" },
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
      const answer = await check(asked, code.data);
      if (answer === undefined) return;
      const { store } = answer;
      if (store !== null && store.id !== draft().store_id) {
        if (store.published) {
          show({
            name: "has_store",
            store: { slug: store.slug, name: store.name },
          });
          return;
        }
        adopt(store.id);
      }
      await publish("code");
    },
    async retry() {
      if (step.name !== "retry") return;
      await publish("retry");
    },
    changeNumber() {
      show({ name: "phone", error: undefined });
    },
  };
}

function statusOf(error: unknown): unknown {
  return typeof error === "object" && error !== null && "status" in error
    ? error.status
    : undefined;
}

function codeOf(error: unknown): unknown {
  return typeof error === "object" && error !== null && "code" in error
    ? error.code
    : undefined;
}

function localError(code: "phone_invalid" | "code_invalid"): Error {
  return Object.assign(new Error(code), { code });
}
