import { randomBytes } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

export type PhotoKind = "jpg" | "png" | "webp";

export type Photos = {
  save(storeId: string, bytes: Uint8Array, kind: PhotoKind): Promise<string>;
  read(name: string): Promise<Buffer | undefined>;
  remove(name: string): Promise<void>;
};

export const photoMediaTypes: Record<PhotoKind, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

const urlPrefix = "/api/photos/";
const namePattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-[0-9a-f]{8}\.(jpg|png|webp)$/;

// Photos are files in one folder of DATA_DIR. Each upload gets a new name, so
// a photo address never changes its bytes and can be cached for a year.
export function createPhotos(folder: string): Photos {
  return {
    async save(storeId, bytes, kind) {
      await mkdir(folder, { recursive: true });
      const name = `${storeId}-${randomBytes(4).toString("hex")}.${kind}`;
      await writeFile(join(folder, name), bytes, { flag: "wx" });
      return name;
    },
    async read(name) {
      if (!namePattern.test(name)) return undefined;
      return readFile(join(folder, name)).catch(
        (error: NodeJS.ErrnoException) => {
          if (error.code === "ENOENT") return undefined;
          throw error;
        },
      );
    },
    async remove(name) {
      if (namePattern.test(name)) await rm(join(folder, name), { force: true });
    },
  };
}

// The kind comes from the first bytes, not from what the browser says.
export function photoKindOf(bytes: Uint8Array): PhotoKind | undefined {
  const starts = (...signature: number[]) =>
    signature.every((byte, index) => bytes[index] === byte);
  if (starts(0xff, 0xd8, 0xff)) return "jpg";
  if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "png";
  const ascii = (from: number, to: number) =>
    String.fromCharCode(...bytes.subarray(from, to));
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "webp";
  return undefined;
}

export function photoUrl(name: string): string {
  return `${urlPrefix}${name}`;
}

export function photoNameOf(url: string | null): string | undefined {
  if (url === null || !url.startsWith(urlPrefix)) return undefined;
  const name = url.slice(urlPrefix.length);
  return namePattern.test(name) ? name : undefined;
}

export function photoMediaType(name: string): string | undefined {
  const kind = name.slice(name.lastIndexOf(".") + 1);
  return kind === "jpg" || kind === "png" || kind === "webp"
    ? photoMediaTypes[kind]
    : undefined;
}
