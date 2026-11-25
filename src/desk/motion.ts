// The one long motion of the desk: a saved slip moves from where she saved
// it to its day on the board, so that she sees where the order went. It
// takes the duration and the easing of the tokens, and is an instant change
// under reduced motion.
export function moveFrom(element: HTMLElement, from: DOMRect): void {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const to = element.getBoundingClientRect();
  const dx = from.left - to.left;
  const dy = from.top - to.top;
  if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
  const tokens = getComputedStyle(document.documentElement);
  const duration = Number.parseFloat(tokens.getPropertyValue("--dur-long"));
  const easing = tokens.getPropertyValue("--out-expo").trim();
  element.setAttribute("data-moving", "");
  const done = () => element.removeAttribute("data-moving");
  element
    .animate(
      [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }],
      {
        duration: Number.isFinite(duration) ? duration : 600,
        easing: easing || "ease-out",
      },
    )
    .finished.then(done, done);
}
