import { leaveDelayMs } from "./schedule.ts";

/**
 * A link that leaves the page, such as Send on WhatsApp, plays its sound first and opens a moment
 * later, so that the sound starts before the page goes. A click with a modifier key, or one that
 * another handler took, opens as the browser does.
 */
export function leaveWithSound(
  event: MouseEvent,
  link: HTMLAnchorElement,
  play: () => void,
): void {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  ) {
    return;
  }
  event.preventDefault();
  play();
  const { href, target } = link;
  setTimeout(() => {
    if (target === "_blank") open(href, "_blank", "noopener");
    else location.assign(href);
  }, leaveDelayMs);
}
