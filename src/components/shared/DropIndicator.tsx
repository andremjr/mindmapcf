/**
 * Visual cue rendered between draggable items to show exactly where a
 * held item will land when released. Used by Tier List / Ranking editors
 * and the Tier List manual-mode presentation.
 */
export function DropIndicator({
  orientation = "vertical",
}: {
  orientation?: "vertical" | "horizontal";
}) {
  if (orientation === "horizontal") {
    return (
      <div
        aria-hidden
        className="w-full h-[3px] my-0.5 rounded-full bg-primary shadow-[0_0_10px_2px_hsl(var(--primary)/0.75)] animate-pulse pointer-events-none"
      />
    );
  }
  return (
    <div
      aria-hidden
      className="w-[3px] self-stretch mx-0.5 rounded-full bg-primary shadow-[0_0_10px_2px_hsl(var(--primary)/0.75)] animate-pulse pointer-events-none"
    />
  );
}

/**
 * Insertion index (0..cards.length inclusive) based on pointer position,
 * computed against actual visible children marked with [data-item-id].
 * Row-aware (only cards vertically overlapping the pointer count).
 */
export function visualInsertIndex(
  container: HTMLElement,
  clientX: number,
  clientY: number,
): number {
  const cards = Array.from(
    container.querySelectorAll<HTMLElement>("[data-item-id]"),
  );
  for (let i = 0; i < cards.length; i++) {
    const r = cards[i].getBoundingClientRect();
    if (clientY < r.top || clientY > r.bottom) continue;
    if (clientX < r.left + r.width / 2) return i;
  }
  return cards.length;
}

/**
 * Vertical-list variant: pick the row whose midline is closest above the
 * pointer. Returns 0..cards.length inclusive.
 */
export function visualInsertIndexVertical(
  container: HTMLElement,
  clientY: number,
): number {
  const cards = Array.from(
    container.querySelectorAll<HTMLElement>("[data-item-id]"),
  );
  for (let i = 0; i < cards.length; i++) {
    const r = cards[i].getBoundingClientRect();
    if (clientY < r.top + r.height / 2) return i;
  }
  return cards.length;
}
