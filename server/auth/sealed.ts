import { z } from 'zod';
import { decodeBase64Url, encodeBase64Url } from './base64url';

const envelopeSchema = z.object({ v: z.literal(1), iv: z.string(), ct: z.string() });

async function deriveKey(secret: string): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
  return crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function seal(value: unknown, secret: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(value));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    await deriveKey(secret),
    plaintext,
  );
  return encodeBase64Url(
    new TextEncoder().encode(
      JSON.stringify({
        v: 1,
        iv: encodeBase64Url(iv),
        ct: encodeBase64Url(new Uint8Array(ciphertext)),
      }),
    ),
  );
}

export async function unseal<T>(token: string, secret: string): Promise<T | null> {
  try {
    const envelope = envelopeSchema.parse(
      JSON.parse(new TextDecoder().decode(decodeBase64Url(token))),
    );
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: Uint8Array.from(decodeBase64Url(envelope.iv)) },
      await deriveKey(secret),
      Uint8Array.from(decodeBase64Url(envelope.ct)).buffer,
    );
    return JSON.parse(new TextDecoder().decode(plaintext)) as T;
  } catch {
    return null;
  }
}
