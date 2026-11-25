// The long motion: the buyer's first pack moves into the cart bar, so she
// sees where it went. With reduced motion, the cart bar simply shows it.
export function flyToCart({
  from,
  to,
  label,
}: {
  from: HTMLElement;
  to: HTMLElement;
  label: string;
}): void {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const start = from.getBoundingClientRect();
  const end = to.getBoundingClientRect();
  if (start.width === 0 || end.width === 0) return;
  const tokens = getComputedStyle(document.documentElement);
  const duration = Number.parseFloat(tokens.getPropertyValue("--dur-long"));
  const easing = tokens.getPropertyValue("--out-expo").trim();
  const ghost = document.createElement("span");
  ghost.className = "fly num";
  ghost.setAttribute("aria-hidden", "true");
  ghost.textContent = label;
  ghost.style.left = `${start.left}px`;
  ghost.style.top = `${start.top}px`;
  document.body.append(ghost);
  const size = ghost.getBoundingClientRect();
  const dx = end.left + end.width / 2 - (start.left + size.width / 2);
  const dy = end.top + end.height / 2 - (start.top + size.height / 2);
  const animation = ghost.animate(
    [
      { transform: "translate(0, 0)" },
      { transform: `translate(${dx}px, ${dy}px)` },
    ],
    {
      duration: Number.isFinite(duration) ? duration : 600,
      easing: easing === "" ? "ease-out" : easing,
    },
  );
  animation.finished.then(
    () => ghost.remove(),
    () => ghost.remove(),
  );
}
