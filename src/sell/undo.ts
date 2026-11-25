export type UndoOffer = { words: string; restore: () => void };

export type Undo = {
  readonly offer: UndoOffer | undefined;
  give(offer: UndoOffer): void;
  undo(): void;
  dismiss(): void;
};

export const undoMs = 10_000;

// A removal happens at once and offers Undo for 10 s, in place of a
// question before it. A new removal ends the offer before it.
export function createUndo({
  onChange,
  ms = undoMs,
}: {
  onChange: (offer: UndoOffer | undefined) => void;
  ms?: number;
}): Undo {
  let current: UndoOffer | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const dismiss = () => {
    clearTimeout(timer);
    timer = undefined;
    if (current === undefined) return;
    current = undefined;
    onChange(undefined);
  };

  return {
    get offer() {
      return current;
    },
    give(offer) {
      clearTimeout(timer);
      current = offer;
      onChange(offer);
      timer = setTimeout(dismiss, ms);
    },
    undo() {
      const offer = current;
      if (offer === undefined) return;
      dismiss();
      offer.restore();
    },
    dismiss,
  };
}
