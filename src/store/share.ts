import { isAbortError } from "../api/api.ts";

export type Sharer = {
  share?: (data: { title?: string; url?: string }) => Promise<void>;
  clipboard?: { writeText(text: string): Promise<void> };
};

export type ShareResult = "shared" | "copied" | "cancelled";

// The phone's own share sheet first, then a copied link. The buyer closing
// the share sheet is not a failure.
export async function shareLink(
  sharer: Sharer,
  { title, url }: { title: string; url: string },
): Promise<ShareResult> {
  if (sharer.share !== undefined) {
    try {
      await sharer.share({ title, url });
      return "shared";
    } catch (error) {
      if (isAbortError(error)) return "cancelled";
    }
  }
  if (sharer.clipboard === undefined) {
    throw new Error("This browser can neither share nor copy.");
  }
  await sharer.clipboard.writeText(url);
  return "copied";
}
