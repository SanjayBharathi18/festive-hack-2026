import { generateKeyPairSync } from "node:crypto";

export type VapidKeys = { publicKey: string; privateKey: string };

export function createVapidKeys(): VapidKeys {
  const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const { x, y, d } = privateKey.export({ format: "jwk" });
  if (!x || !y || !d) throw new Error("The P-256 key has no x, y or d.");
  const point = Buffer.concat([
    Buffer.from([0x04]),
    Buffer.from(x, "base64url"),
    Buffer.from(y, "base64url"),
  ]);
  return { publicKey: point.toString("base64url"), privateKey: d };
}

export function envLines(keys: VapidKeys, subject: string): string {
  return [
    `VAPID_PUBLIC_KEY=${keys.publicKey}`,
    `VAPID_PRIVATE_KEY=${keys.privateKey}`,
    `VAPID_SUBJECT=${subject}`,
  ].join("\n");
}

if (import.meta.main) {
  const subject = process.argv[2] ?? "mailto:team@example.com";
  console.log(envLines(createVapidKeys(), subject));
  if (process.argv[2] === undefined) {
    console.error(
      "Copy the three lines into .env. Change VAPID_SUBJECT to the team address, or pass it: npm run vapid -- mailto:you@example.com",
    );
  }
}
