import {
  checkoutAnswerSchema,
  type CheckoutAnswer,
  type CheckoutBody,
} from "../../shared/orders.ts";
import { toE164 } from "../../shared/phone.ts";
import {
  verifyCheckAnswerSchema,
  verifyStartAnswerSchema,
  type VerifyStartAnswer,
} from "../../shared/verify.ts";
import { isApiError, type Api } from "../api/api.ts";

export type CheckoutPhase = "details" | "code" | "verified";
export type OrderInput = Omit<CheckoutBody, "proof">;
export type Sent = { phone: string; answer: VerifyStartAnswer };
export type Proof = { token: string; expiresAt: number; phone: string };
export type Kept = { sent?: Sent; proof?: Proof };

export type CheckoutFlow = {
  readonly phase: CheckoutPhase;
  readonly code: VerifyStartAnswer | undefined;
  sendCode(phone: string, signal?: AbortSignal): Promise<VerifyStartAnswer>;
  place(
    order: OrderInput,
    answer: { phone: string; code: string },
    signal?: AbortSignal,
  ): Promise<CheckoutAnswer>;
  phoneChanged(phone: string): boolean;
};

// A proof this close to its end is not worth sending.
export const proofMarginMs = 10_000;

// The last step: a code for the number, then the order. A checked code gives
// a proof for one order, so a retry after a full day or a new price reuses
// the proof and does not ask for the code again. The tab keeps the sent code
// and the proof (onKeep), so a trip to another page keeps them while they
// are valid.
export function createCheckoutFlow({
  api,
  now = () => Date.now(),
  kept,
  onKeep = () => {},
}: {
  api: Pick<Api, "send">;
  now?: () => number;
  kept?: Kept | undefined;
  onKeep?: (kept: Kept | undefined) => void;
}): CheckoutFlow {
  const valid = (expiresAt: number) => expiresAt - proofMarginMs > now();
  let proof =
    kept?.proof !== undefined && valid(kept.proof.expiresAt)
      ? kept.proof
      : undefined;
  let sent =
    proof === undefined &&
    kept?.sent !== undefined &&
    valid(kept.sent.answer.expires_at)
      ? kept.sent
      : undefined;
  let phase: CheckoutPhase =
    proof !== undefined ? "verified" : sent !== undefined ? "code" : "details";

  const reset = () => {
    phase = "details";
    sent = undefined;
    proof = undefined;
    onKeep(undefined);
  };

  return {
    get phase() {
      return phase;
    },
    get code() {
      return sent?.answer;
    },
    async sendCode(phone, signal) {
      const answer = await api.send(
        "POST",
        "/api/verify/start",
        { phone, purpose: "order" },
        verifyStartAnswerSchema,
        { signal },
      );
      sent = { phone: toE164(phone), answer };
      proof = undefined;
      phase = "code";
      onKeep({ sent });
      return answer;
    },
    async place(order, { phone, code }, signal) {
      const number = toE164(phone);
      if (
        proof === undefined ||
        proof.phone !== number ||
        !valid(proof.expiresAt)
      ) {
        // A kept proof ran out: the buyer asks for a new code.
        if (phase === "verified") {
          reset();
          throw proofExpired();
        }
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
        sent = undefined;
        phase = "verified";
        onKeep({ proof });
      }
      try {
        const answer = await api.send(
          "POST",
          "/api/orders",
          { ...order, proof: proof.token },
          checkoutAnswerSchema,
          { signal },
        );
        onKeep(undefined);
        return answer;
      } catch (error) {
        if (isApiError(error) && error.code === "proof_invalid") reset();
        throw error;
      }
    },
    phoneChanged(phone) {
      const number = (proof ?? sent)?.phone;
      if (phase === "details" || number === toE164(phone)) return false;
      reset();
      return true;
    },
  };
}

// Its code gives the words "Get a new code" on the page.
function proofExpired(): Error & { code: "proof_invalid" } {
  return Object.assign(new Error("The checked code has expired."), {
    code: "proof_invalid" as const,
  });
}
