import {
  boardPostPageSchema,
  emailProofSchema,
  workEmailSchema,
  type BoardPostFields,
  type BoardPostPage,
} from "../../shared/bulk.ts";
import type { AppLanguage } from "../../shared/languages.ts";
import { toE164 } from "../../shared/phone.ts";
import {
  verifyCheckAnswerSchema,
  verifyStartAnswerSchema,
  type VerifyStartAnswer,
} from "../../shared/verify.ts";
import { isApiError, type Api } from "../api/api.ts";

type Proof = { token: string; expiresAt: number; target: string };

export type BoardCodes = {
  email: string;
  phone: string;
  emailCode: VerifyStartAnswer;
  phoneCode: VerifyStartAnswer;
};

export type BoardFlow = {
  readonly codes: BoardCodes | undefined;
  getCodes(
    email: string,
    phone: string,
    signal?: AbortSignal,
  ): Promise<BoardCodes>;
  post(
    fields: BoardPostFields,
    answer: {
      email: string;
      phone: string;
      emailCode: string;
      phoneCode: string;
    },
    language: AppLanguage,
    signal?: AbortSignal,
  ): Promise<BoardPostPage>;
  changed(email: string, phone: string): boolean;
};

const proofMarginMs = 10_000;

// The last step of a board post: a code for the work email and one for the
// WhatsApp number, then the post. Checked codes give proofs, so a retry
// after an error does not ask for the codes again.
export function createBoardFlow({
  api,
  now = () => Date.now(),
}: {
  api: Pick<Api, "send">;
  now?: () => number;
}): BoardFlow {
  let codes: BoardCodes | undefined;
  let emailProof: Proof | undefined;
  let phoneProof: Proof | undefined;
  const fresh = (proof: Proof | undefined, target: string): proof is Proof =>
    proof !== undefined &&
    proof.target === target &&
    proof.expiresAt - proofMarginMs > now();
  const reset = () => {
    codes = undefined;
    emailProof = undefined;
    phoneProof = undefined;
  };

  return {
    get codes() {
      return codes;
    },
    async getCodes(email, phone, signal) {
      const [emailCode, phoneCode] = await Promise.all([
        api.send(
          "POST",
          "/api/board-posts/email/start",
          { email },
          verifyStartAnswerSchema,
          { signal },
        ),
        api.send(
          "POST",
          "/api/verify/start",
          { phone, purpose: "order" },
          verifyStartAnswerSchema,
          { signal },
        ),
      ]);
      emailProof = undefined;
      phoneProof = undefined;
      codes = {
        email: emailOf(email),
        phone: toE164(phone),
        emailCode,
        phoneCode,
      };
      return codes;
    },
    async post(fields, answer, language, signal) {
      const email = emailOf(answer.email);
      const phone = toE164(answer.phone);
      if (!fresh(emailProof, email)) {
        const checked = await api.send(
          "POST",
          "/api/board-posts/email/check",
          { email: answer.email, code: answer.emailCode },
          emailProofSchema,
          { signal },
        );
        emailProof = {
          token: checked.proof,
          expiresAt: checked.expires_at,
          target: email,
        };
      }
      if (!fresh(phoneProof, phone)) {
        const checked = await api.send(
          "POST",
          "/api/verify/check",
          { phone: answer.phone, purpose: "order", code: answer.phoneCode },
          verifyCheckAnswerSchema,
          { signal },
        );
        if (checked.purpose !== "order") {
          throw new Error("The code check answered for a desk sign-in.");
        }
        phoneProof = {
          token: checked.proof,
          expiresAt: checked.expires_at,
          target: phone,
        };
      }
      try {
        return await api.send(
          "POST",
          "/api/board-posts",
          {
            ...fields,
            proof: phoneProof.token,
            email_proof: emailProof.token,
            language,
          },
          boardPostPageSchema,
          { signal },
        );
      } catch (error) {
        if (isApiError(error) && error.code === "proof_invalid") reset();
        throw error;
      }
    },
    changed(email, phone) {
      if (codes === undefined) return false;
      if (codes.email === emailOf(email) && codes.phone === toE164(phone)) {
        return false;
      }
      reset();
      return true;
    },
  };
}

function emailOf(email: string): string {
  return workEmailSchema.safeParse(email).data ?? email.trim().toLowerCase();
}
