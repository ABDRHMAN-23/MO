import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const KEY_ENV = "INTEGRATION_ENCRYPTION_KEY";

function key(): Buffer {
  const value = process.env[KEY_ENV];
  if (!value || !/^[0-9a-f]{64}$/i.test(value)) {
    throw new Error(`${KEY_ENV} must be a 32-byte hex key`);
  }
  return Buffer.from(value, "hex");
}

export function encryptSecret(secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64url")}:${tag.toString("base64url")}:${ciphertext.toString("base64url")}`;
}

export function decryptSecret(value: string): string {
  const [version, ivRaw, tagRaw, cipherRaw] = value.split(":");
  if (version !== "v1" || !ivRaw || !tagRaw || !cipherRaw) throw new Error("Unsupported secret format");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(ivRaw, "base64url"));
  decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(cipherRaw, "base64url")), decipher.final()]).toString("utf8");
}
