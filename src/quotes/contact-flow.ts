import { toE164 } from "../../shared/phone.ts";
import {
  quoteAnswerSchema,
  type QuoteAnswer,
  type QuoteBody,
} from "../../shared/quotes.ts";
import {
  verifyCheckAnswerSchema,
  verifyStartAnswerSchema,
  type VerifyStartAnswer,
} from "../../shared/verify.ts";
import { isApiError, type Api } from "../api/api.ts";

export type ContactPhase = "details" | "code" | "sent";

export type ContactFlow = {
  readonly phase: ContactPhase;
  readonly code: VerifyStartAnswer | undefined;
  readonly answer: QuoteAnswer | undefined;
  sendCode(phone: string, signal?: AbortSignal): Promise<VerifyStartAnswer>;
  send(
    request: Omit<QuoteBody, "proof">,
    answer: { phone: string; code: string },
    signal?: AbortSignal,
  ): Promise<QuoteAnswer>;
  phoneChanged(phone: string): boolean;
  reset(): void;
};

// A proof this close to its end is not worth sending.
export const proofMarginMs = 10_000;

// Contact seller: a code for the WhatsApp number, then the request. A checked
// code gives a buyer proof for one request, so a retry after an error reuses
// it and does not ask for the code again.
export function createContactFlow({
  api,
  now = () => Date.now(),
}: {
  api: Pick<Api, "send">;
  now?: () => number;
}): ContactFlow {
  let phase: ContactPhase = "details";
  let sent: { phone: string; answer: VerifyStartAnswer } | undefined;
  let proof: { token: string; expiresAt: number; phone: string } | undefined;
  let answer: QuoteAnswer | undefined;

  const reset = () => {
    phase = "details";
    sent = undefined;
    proof = undefined;
    answer = undefined;
  };

  return {
    get phase() {
      return phase;
    },
    get code() {
      return sent?.answer;
    },
    get answer() {
      return answer;
    },
    async sendCode(phone, signal) {
      const started = await api.send(
        "POST",
        "/api/verify/start",
        { phone, purpose: "order" },
        verifyStartAnswerSchema,
        { signal },
      );
      sent = { phone: toE164(phone), answer: started };
      proof = undefined;
      phase = "code";
      return started;
    },
    async send(request, { phone, code }, signal) {
      const number = toE164(phone);
      if (
        proof === undefined ||
        proof.phone !== number ||
        proof.expiresAt - proofMarginMs <= now()
      ) {
        const checked = await api.send(
          "POST",
          "/api/verify/check",
          { phone, purpose: "order", code },
          verifyCheckAnswerSchema,
          { signal },
        );
        if (checked.purpose !== "order") {
          throw new Error("The code check answered for a desk sign-in.");
        }
        proof = {
          token: checked.proof,
          expiresAt: checked.expires_at,
          phone: number,
        };
      }
      try {
        answer = await api.send(
          "POST",
          "/api/quotes",
          { ...request, proof: proof.token },
          quoteAnswerSchema,
          { signal },
        );
        phase = "sent";
        return answer;
      } catch (error) {
        if (isApiError(error) && error.code === "proof_invalid") {
          phase = "details";
          sent = undefined;
          proof = undefined;
        }
        throw error;
      }
    },
    phoneChanged(phone) {
      if (phase !== "code" || sent?.phone === toE164(phone)) return false;
      reset();
      return true;
    },
    reset,
  };
}
