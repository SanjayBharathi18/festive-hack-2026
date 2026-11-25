import { qrPath } from "../../shared/setup.ts";
import { find } from "../dom/dom.ts";
import type { Text } from "../text/text.ts";
import type { Published } from "./draft.ts";
import { shareUrl } from "./step-values.ts";

export type ShareView = { show(published: Published): void };

// Her published store: Share on WhatsApp, the link to copy, and the QR code
// from the server for her counter.
export function createShareView({
  root,
  text,
  clipboard,
}: {
  root: HTMLElement;
  text: Text;
  clipboard: Pick<Clipboard, "writeText"> | undefined;
}): ShareView {
  const url = find(root, "#share-url", HTMLElement);
  const copied = find(root, "#share-copied", HTMLElement);
  let link = "";

  find(root, "#share-copy", HTMLButtonElement).addEventListener("click", () => {
    copied.textContent = "";
    const copy =
      clipboard?.writeText(link) ?? Promise.reject(new Error("No clipboard"));
    copy.then(
      () => {
        copied.className = "done";
        copied.textContent = text.t("sell.share.copied");
      },
      (error: unknown) => {
        console.error("The link was not copied.", error);
        copied.className = "error";
        copied.textContent = text.t("sell.share.copy_failed");
      },
    );
  });

  return {
    show(published) {
      link = published.url;
      url.textContent = published.url;
      find(root, "#share-whatsapp", HTMLAnchorElement).href = shareUrl(
        text.t("sell.share.message", {
          store: published.name,
          url: published.url,
        }),
      );
      find(root, "#share-open", HTMLAnchorElement).href =
        `/s/${published.slug}`;
      const qr = find(root, "#share-qr", HTMLImageElement);
      qr.src = qrPath(published.slug);
      qr.alt = text.t("sell.share.qr_alt", { url: published.url });
      const download = find(root, "#share-qr-download", HTMLAnchorElement);
      download.href = qrPath(published.slug);
      download.download = `${published.slug}-qr.svg`;
    },
  };
}
