import type { LimitUnit } from "../../shared/model.ts";
import type { Text } from "../text/text.ts";
import { amountOf, readout } from "./amounts.ts";
import { gaugeSegments } from "./load.ts";

export type GaugeData = {
  unit: LimitUnit;
  limit: number | null;
  load: number;
  draft?: number | undefined;
  past?: boolean | undefined;
};

// The capacity gauge of one day: one segment for each unit of her limit,
// booked in ink, open in leaf, a draft dashed, and Full in kumkum.
export function fillGauge(root: ParentNode, data: GaugeData, text: Text): void {
  const shown = root.querySelector(".readout");
  const meter = root.querySelector("meter");
  const list = root.querySelector(".segments");
  const foot = root.querySelector(".gauge-foot");
  const { unit, limit, load, draft = 0 } = data;

  if (limit === null || data.past) {
    if (shown) shown.textContent = amountOf(unit, load, text);
    if (meter) meter.hidden = true;
    if (list) list.replaceChildren();
    if (foot) {
      foot.textContent = data.past
        ? text.t("desk.day.earlier")
        : draft > 0
          ? text.t("desk.gauge.draft", { amount: amountOf(unit, draft, text) })
          : text.t("desk.gauge.no_limit");
    }
    return;
  }

  const words = readout(unit, load, limit);
  if (shown) shown.textContent = words;
  if (meter) {
    meter.hidden = false;
    meter.max = limit;
    meter.value = Math.min(load, limit);
    meter.textContent = words;
  }
  if (list) {
    const states = gaugeSegments(unit, limit, load, draft);
    while (list.children.length > states.length)
      list.lastElementChild?.remove();
    while (list.children.length < states.length) {
      list.append(document.createElement("li"));
    }
    states.forEach((state, index) => {
      const segment = list.children[index];
      if (segment instanceof HTMLElement && segment.dataset.state !== state) {
        segment.dataset.state = state;
      }
    });
  }
  if (!foot) return;
  if (draft > 0) {
    foot.textContent = text.t("desk.gauge.draft", {
      amount: amountOf(unit, draft, text),
    });
  } else if (load >= limit) {
    const full = document.createElement("span");
    full.className = "full";
    full.textContent = text.t("desk.gauge.full");
    foot.replaceChildren(full);
  } else {
    foot.textContent = text.t("desk.gauge.left", {
      amount: amountOf(unit, limit - load, text),
    });
  }
}
