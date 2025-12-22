import { randomBytes, createCipheriv, hkdfSync } from "node:crypto";
import { getPublicKey, getSharedSecret } from "@noble/secp256k1";

export function encrypt(
  message: Buffer,
  recipientPubKey: Buffer,
  senderPrivKey: Uint8Array
): Buffer {
  const sharedPoint = getSharedSecret(senderPrivKey, recipientPubKey, false);
  const pubRaw = getPublicKey(senderPrivKey, false);
  const hkdfInput = Buffer.concat([pubRaw, sharedPoint]);
  const symmKey = Buffer.from(
    hkdfSync("sha256", hkdfInput, Buffer.alloc(0), Buffer.alloc(0), 32)
  );

  const nonce = randomBytes(16);
  const cipher = createCipheriv("aes-256-gcm", symmKey, nonce);

  const ciphertext = Buffer.concat([cipher.update(message), cipher.final()]);
  const tag = cipher.getAuthTag();

  return Buffer.concat([nonce, tag, ciphertext]);
}
