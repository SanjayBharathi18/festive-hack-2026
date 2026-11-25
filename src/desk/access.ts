import {
  deskSessionSchema,
  deskStoreSchema,
  type DeskStore,
} from "../../shared/desk.ts";
import { isApiError, type Api } from "../api/api.ts";

export type TokenStore = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};
export type Opened =
  { kind: "desk"; desk: DeskStore } | { kind: "sign_in"; demoRefused: boolean };

export const demoHeader = "X-Demo-Token";
// The demo desk keeps its token for the tab under this key, for the desk,
// the package editor and the incident view.
export const demoTokenKey = "desk.demo-token";
export const eventsPath = "/api/desk/events";

// The desk asks who she is: her store, or the sign-in when there is no
// session. The session check answers without an error when she is signed
// out. A refused demo link is forgotten, so that the sign-in can follow.
export async function openDesk({
  api,
  demoToken,
  tokens,
  signal,
}: {
  api: Pick<Api, "get">;
  demoToken: string | undefined;
  tokens: TokenStore;
  signal?: AbortSignal | undefined;
}): Promise<Opened> {
  const signIn = (): Opened => {
    if (demoToken !== undefined) tokens.removeItem(demoTokenKey);
    return { kind: "sign_in", demoRefused: demoToken !== undefined };
  };
  const session = await api.get("/api/desk/session", deskSessionSchema, {
    signal,
  });
  if (!session.signed_in) return signIn();
  try {
    const desk = await api.get("/api/desk/store", deskStoreSchema, { signal });
    return { kind: "desk", desk };
  } catch (error) {
    if (!isApiError(error) || error.code !== "not_signed_in") throw error;
    return signIn();
  }
}

// A demo link keeps its token for the tab and takes it out of the address
// bar, so that the secret does not stay in the history or a shared screen.
export function takeDemoToken(
  url: URL,
  tokens: TokenStore,
): { token: string | undefined; cleaned: URL | undefined } {
  const given = url.searchParams.get("demo")?.trim();
  if (given === undefined) {
    return {
      token: tokens.getItem(demoTokenKey) ?? undefined,
      cleaned: undefined,
    };
  }
  const cleaned = new URL(url);
  cleaned.searchParams.delete("demo");
  if (given === "") return { token: undefined, cleaned };
  tokens.setItem(demoTokenKey, given);
  return { token: given, cleaned };
}

// EventSource cannot set headers, so the demo token goes in the query.
export function eventsUrl(token: string | undefined): string {
  return token === undefined
    ? eventsPath
    : `${eventsPath}?${new URLSearchParams({ demo: token })}`;
}
