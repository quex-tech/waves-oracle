import { base16Encode } from "@waves/ts-lib-crypto";
import {
  HttpActionWithProof,
  QuexResponse,
  type JsonQuexResponse,
} from "./models.js";
import { hexToBuffer } from "./utils.js";

class SignerClient {
  constructor(private readonly url: string) {}

  async query(
    action: HttpActionWithProof | Buffer,
    relayer: Uint8Array
  ): Promise<QuexResponse> {
    const res = await fetch(new URL("/query", this.url), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: (Buffer.isBuffer(action) ? action : action.toBytes()).toString(
          "base64"
        ),
        relayer: base16Encode(relayer),
        format: "ride",
      }),
    });
    if (!res.ok) {
      throw new Error(
        `Failed to query signer: ${res.status} ${res.statusText}`
      );
    }
    const body = (await res.json()) as JsonQuexResponse;
    return QuexResponse.parse(body);
  }

  async publicKey(): Promise<Buffer> {
    const res = await fetch(new URL("/pubkey", this.url));
    if (!res.ok) {
      throw new Error(
        `Failed to get signer's public key: ${res.status} ${res.statusText}`
      );
    }
    return hexToBuffer(await res.text());
  }

  async address(): Promise<string> {
    const res = await fetch(new URL("/address", this.url));
    if (!res.ok) {
      throw new Error(
        `Failed to get signer's address: ${res.status} ${res.statusText}`
      );
    }
    return await res.text();
  }
}

export { SignerClient };
