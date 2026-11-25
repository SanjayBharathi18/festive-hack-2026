import type { CartChange } from "./cart.ts";
import { nameText, shownName } from "../../shared/item-names.ts";
import { packLabel } from "./pack-label.ts";
import { formatMoney } from "../text/format.ts";
import type { Text } from "../text/text.ts";

// The cart kept on the phone met today's menu: say what changed and why.
export function cartNotice(
  changes: readonly CartChange[],
  text: Pick<Text, "t" | "pieces" | "language">,
): string {
  return changes
    .map((change) => {
      if (change.kind === "gone") return text.t("store.notice.gone");
      const item = nameText(shownName(change.item, text.language));
      if (change.kind === "sold_out") {
        return text.t("store.notice.sold_out", { item });
      }
      return text.t("store.notice.price", {
        item,
        pack: packLabel(change.pack, text),
        price: formatMoney(change.pack.price),
      });
    })
    .filter((words, index, all) => all.indexOf(words) === index)
    .join(" ");
}
