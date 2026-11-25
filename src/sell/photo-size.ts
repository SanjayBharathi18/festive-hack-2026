export type Size = { width: number; height: number };
export type ShrinkStep = { side: number; quality: number };

// Each try is smaller than the one before it, until the photo fits.
export const shrinkSteps: readonly ShrinkStep[] = [
  { side: 1600, quality: 0.82 },
  { side: 1280, quality: 0.75 },
  { side: 960, quality: 0.7 },
  { side: 720, quality: 0.65 },
];

export function fitWithin(size: Size, maxSide: number): Size {
  const scale = Math.min(1, maxSide / Math.max(size.width, size.height, 1));
  return {
    width: Math.max(1, Math.round(size.width * scale)),
    height: Math.max(1, Math.round(size.height * scale)),
  };
}

export function blobOfDataUrl(url: string): Blob {
  const match = /^data:(image\/[\w.+-]+);base64,(.*)$/s.exec(url);
  if (match === null) throw photoError("photo_unreadable");
  const [, type = "", base64 = ""] = match;
  const bytes = Uint8Array.from(atob(base64), (character) =>
    character.charCodeAt(0),
  );
  return new Blob([bytes], { type });
}

export function photoError(
  code: "photo_unreadable" | "photo_too_big",
  cause?: unknown,
): Error {
  return Object.assign(new Error(code, { cause }), { code });
}
