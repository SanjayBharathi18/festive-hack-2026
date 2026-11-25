import { setupLimits } from "../../shared/setup.ts";
import { fitWithin, photoError, shrinkSteps } from "./photo-size.ts";

// The browser shrinks her photo before it leaves the laptop: a JPEG of
// 1600 px at most on its long side, and 2 MB at most.
export async function shrinkPhoto(
  file: Blob,
  signal?: AbortSignal,
): Promise<Blob> {
  const bitmap = await createImageBitmap(file).catch((error: unknown) => {
    throw photoError("photo_unreadable", error);
  });
  try {
    for (const step of shrinkSteps) {
      signal?.throwIfAborted();
      const { width, height } = fitWithin(bitmap, step.side);
      const canvas = new OffscreenCanvas(width, height);
      const context = canvas.getContext("2d");
      if (context === null) throw photoError("photo_unreadable");
      context.drawImage(bitmap, 0, 0, width, height);
      const blob = await canvas.convertToBlob({
        type: "image/jpeg",
        quality: step.quality,
      });
      if (blob.size <= setupLimits.photoBytes) return blob;
    }
  } finally {
    bitmap.close();
  }
  throw photoError("photo_too_big");
}

export function readDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result)));
    reader.addEventListener("error", () =>
      reject(photoError("photo_unreadable", reader.error)),
    );
    reader.readAsDataURL(blob);
  });
}
