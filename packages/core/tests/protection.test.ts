import { expect, it } from "vitest";
import {
  createProtectionSalt,
  deriveProtectionKey,
  openProtectedPayload,
  ProtectionAuthenticationError,
  ProtectionFormatError,
  sealProtectedPayload,
} from "../src/protection";

it("authenticates binary payloads, routes, passwords, and ciphertext", async () => {
  const salt = createProtectionSalt();
  const key = await deriveProtectionKey("correct horse battery staple", salt);
  const bytes = Uint8Array.from([0, 1, 2, 255]);
  const envelope = await sealProtectedPayload(key, salt, "note:locked", bytes);
  const second = await sealProtectedPayload(key, salt, "note:locked", bytes);

  expect(envelope.version).toBe(1);
  expect(envelope.iv).not.toBe(second.iv);
  expect(await openProtectedPayload(key, envelope, "note:locked")).toEqual(bytes);
  await expect(openProtectedPayload(key, envelope, "note:other")).rejects.toBeInstanceOf(ProtectionFormatError);

  const wrongKey = await deriveProtectionKey("wrong password", salt);
  await expect(openProtectedPayload(wrongKey, envelope, "note:locked")).rejects.toBeInstanceOf(ProtectionAuthenticationError);
  const altered = { ...envelope, ciphertext: `${envelope.ciphertext.slice(0, -4)}AAAA` };
  await expect(openProtectedPayload(key, altered, "note:locked")).rejects.toBeInstanceOf(ProtectionAuthenticationError);
  await expect(deriveProtectionKey("password", "not base64!")).rejects.toBeInstanceOf(ProtectionFormatError);
  await expect(openProtectedPayload(key, { ...envelope, iv: "bad!" }, "note:locked"))
    .rejects.toBeInstanceOf(ProtectionFormatError);
});
