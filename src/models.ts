import { URL } from "node:url";
import { keccak } from "@waves/ts-lib-crypto";
import { hexToBuffer } from "./utils.js";
import { encrypt } from "./crypto.js";
import { getPublicKey } from "@noble/secp256k1";

const HTTP_METHODS = {
  GET: 0,
  POST: 1,
  PATCH: 2,
  DELETE: 3,
  OPTIONS: 4,
  TRACE: 5,
} as const;

const ANY_TD_ADDRESS = "0x0000000000000000000000000000000000000000";

type HttpMethodName = keyof typeof HTTP_METHODS;

export function isHttpMethod(value: string): value is HttpMethodName {
  return HTTP_METHODS[value as HttpMethodName] !== undefined;
}

const enc = (() => {
  const i64 = (n: number | bigint): Buffer => {
    const b = Buffer.allocUnsafe(8);
    b.writeBigInt64BE(BigInt(n), 0);
    return b;
  };

  const bytes = (buf: Buffer): Buffer => Buffer.concat([i64(buf.length), buf]);

  const str = (s: string): Buffer => bytes(Buffer.from(s, "utf8"));

  const list = (items: Buffer[]): Buffer =>
    Buffer.concat([i64(items.length), ...items]);

  return { i64, bytes, str, list };
})();

class RequestHeader {
  constructor(public readonly key: string, public readonly value: string) {}

  static fromString(str: string): RequestHeader {
    const parts = str.split(":");
    return new RequestHeader(parts[0].trim(), parts[1].trim());
  }

  toBytes(): Buffer {
    return Buffer.concat([enc.str(this.key), enc.str(this.value)]);
  }
}

class QueryParameter {
  constructor(public readonly key: string, public readonly value: string) {}

  toBytes(): Buffer {
    return Buffer.concat([enc.str(this.key), enc.str(this.value)]);
  }
}

class HttpRequest {
  constructor(
    public readonly method: HttpMethodName,
    public readonly host: string,
    public readonly path: string,
    public readonly headers: RequestHeader[],
    public readonly parameters: QueryParameter[],
    public readonly body: string
  ) {}

  static fromParts(
    method: HttpMethodName,
    url: string,
    headers: string[],
    body: string
  ) {
    const parsedUrl = new URL(url);
    return new HttpRequest(
      method,
      parsedUrl.hostname,
      parsedUrl.pathname,
      headers.map((header) => RequestHeader.fromString(header)),
      Array.from(
        parsedUrl.searchParams,
        ([key, value]) => new QueryParameter(key, value)
      ),
      body
    );
  }

  toBytes(): Buffer {
    return Buffer.concat([
      enc.i64(HTTP_METHODS[this.method]),
      enc.str(this.host),
      enc.str(this.path),
      enc.list(this.headers.map((h) => h.toBytes())),
      enc.list(this.parameters.map((p) => p.toBytes())),
      enc.str(this.body),
    ]);
  }
}

class RequestHeaderPatch {
  constructor(
    public readonly key: string,
    public readonly ciphertext: Buffer
  ) {}

  toBytes(): Buffer {
    return Buffer.concat([enc.str(this.key), enc.bytes(this.ciphertext)]);
  }
}

class QueryParameterPatch {
  constructor(
    public readonly key: string,
    public readonly ciphertext: Buffer
  ) {}

  toBytes(): Buffer {
    return Buffer.concat([enc.str(this.key), enc.bytes(this.ciphertext)]);
  }
}

class HttpPrivatePatch {
  constructor(
    public readonly pathSuffix: Buffer,
    public readonly headers: RequestHeaderPatch[],
    public readonly parameters: QueryParameterPatch[],
    public readonly body: Buffer,
    public readonly tdAddress: string
  ) {}

  static empty(): HttpPrivatePatch {
    return new HttpPrivatePatch(
      Buffer.alloc(0),
      [],
      [],
      Buffer.alloc(0),
      ANY_TD_ADDRESS
    );
  }

  toBytes(): Buffer {
    return Buffer.concat([
      enc.bytes(this.pathSuffix),
      enc.list(this.headers.map((h) => h.toBytes())),
      enc.list(this.parameters.map((p) => p.toBytes())),
      enc.bytes(this.body),
      enc.str(this.tdAddress),
    ]);
  }

  isEmpty(): boolean {
    return !(
      (this.pathSuffix && this.pathSuffix.length) ||
      (this.headers && this.headers.length) ||
      (this.parameters && this.parameters.length) ||
      (this.body && this.body.length)
    );
  }
}

class UnencryptedHttpPrivatePatch {
  constructor(
    public readonly pathSuffix: Buffer | null,
    public readonly headers: RequestHeader[],
    public readonly parameters: QueryParameter[],
    public readonly body: Buffer | null
  ) {}

  static empty() {
    return new UnencryptedHttpPrivatePatch(
      Buffer.alloc(0),
      [],
      [],
      Buffer.alloc(0)
    );
  }

  static fromParts(
    urlSuffix: string | null,
    headers: string[] | null,
    body: string | null
  ): UnencryptedHttpPrivatePatch {
    const parsedHeaders = (headers || []).map((header) =>
      RequestHeader.fromString(header)
    );

    let pathSuffix: Buffer | null = null;
    let parameters: QueryParameter[] = [];

    if (urlSuffix) {
      const hasOnlyQuery = urlSuffix.startsWith("?");
      const parsed = new URL(urlSuffix, "https://placeholder");

      const query = parsed.search.length ? parsed.search.slice(1) : "";
      parameters = query
        ? Array.from(
            new URLSearchParams(query),
            ([key, value]) => new QueryParameter(key, value)
          )
        : [];

      const parsedPath = hasOnlyQuery ? "" : parsed.pathname;
      const normalizedPath =
        !urlSuffix.startsWith("/") && parsedPath.startsWith("/")
          ? parsedPath.slice(1)
          : parsedPath;

      pathSuffix = normalizedPath ? Buffer.from(normalizedPath, "utf8") : null;
    }

    return new UnencryptedHttpPrivatePatch(
      pathSuffix,
      parsedHeaders,
      parameters,
      body != null ? Buffer.from(body, "utf8") : null
    );
  }

  encrypt(
    encryptFunc: (data: Buffer) => Buffer,
    tdAddress: string
  ): HttpPrivatePatch {
    const headers = this.headers.map(
      (h) =>
        new RequestHeaderPatch(h.key, encryptFunc(Buffer.from(h.value, "utf8")))
    );
    const parameters = this.parameters.map(
      (p) =>
        new QueryParameterPatch(
          p.key,
          encryptFunc(Buffer.from(p.value, "utf8"))
        )
    );

    const encryptOrEmpty = (value?: Buffer | null): Buffer =>
      value && value.length ? encryptFunc(value) : Buffer.alloc(0);

    return new HttpPrivatePatch(
      encryptOrEmpty(this.pathSuffix),
      headers,
      parameters,
      encryptOrEmpty(this.body),
      tdAddress
    );
  }

  isEmpty(): boolean {
    return !(
      (this.pathSuffix && this.pathSuffix.length) ||
      (this.headers && this.headers.length) ||
      (this.parameters && this.parameters.length) ||
      (this.body && this.body.length)
    );
  }
}

export class UnencryptedHttpAction {
  constructor(
    public readonly request: HttpRequest,
    public readonly patch: UnencryptedHttpPrivatePatch,
    public readonly schema: string,
    public readonly filter: string
  ) {}

  encrypt(tdPublicKey: Buffer, tdAddress: string, senderPrivKey: Uint8Array) {
    const patch = this.patch.isEmpty()
      ? HttpPrivatePatch.empty()
      : this.patch.encrypt(
          (x) => encrypt(x, tdPublicKey, senderPrivKey),
          tdAddress
        );
    return new HttpAction(this.request, patch, this.schema, this.filter);
  }
}

class HttpAction {
  constructor(
    public readonly request: HttpRequest,
    public readonly patch: HttpPrivatePatch,
    public readonly schema: string,
    public readonly filter: string
  ) {}

  toBytes(): Buffer {
    return Buffer.concat([
      this.request.toBytes(),
      this.patch.toBytes(),
      enc.str(this.schema),
      enc.str(this.filter),
    ]);
  }

  getActionId(): Buffer {
    return Buffer.from(keccak(this.toBytes()));
  }

  addProof(
    recipientPubKey: Buffer,
    senderPrivKey: Uint8Array
  ): HttpActionWithProof {
    if (this.patch.isEmpty()) {
      return this.addEmptyProof();
    }

    return new HttpActionWithProof(
      this,
      Buffer.concat([
        getPublicKey(senderPrivKey, false).slice(1),
        encrypt(this.getActionId(), recipientPubKey, senderPrivKey),
      ])
    );
  }

  addEmptyProof() {
    return new HttpActionWithProof(this, Buffer.alloc(0));
  }
}

class HttpActionWithProof {
  constructor(
    public readonly action: HttpAction,
    public readonly proof: Buffer
  ) {}

  toBytes(): Buffer {
    return Buffer.concat([this.action.toBytes(), enc.bytes(this.proof)]);
  }
}

type JsonDataItem = {
  timestamp: number;
  error: number;
  value: string;
};

type JsonQuexMessage = {
  action_id: string;
  data_item: JsonDataItem;
  relayer: string;
};

type JsonSignature = {
  r: string;
  s: string;
  v: number;
};

type JsonQuexResponse = {
  msg: JsonQuexMessage;
  sig: JsonSignature;
};

class DataItem {
  constructor(
    public readonly timestamp: number,
    public readonly error: number,
    public readonly value: Buffer
  ) {}

  static parse(json: JsonDataItem): DataItem {
    return new DataItem(
      json.timestamp,
      json.error,
      Buffer.from(json.value, "base64")
    );
  }

  static fromBytes(buf: Buffer): DataItem {
    return new DataItem(
      Number(buf.readBigInt64BE()),
      Number(buf.readBigInt64BE(8)),
      buf.subarray(24, 24 + Number(buf.readBigInt64BE(16)))
    );
  }

  toBytes(): Buffer {
    return Buffer.concat([
      enc.i64(this.timestamp),
      enc.i64(this.error),
      enc.bytes(this.value),
    ]);
  }
}

class QuexMessage {
  constructor(
    public readonly actionId: Buffer,
    public readonly dataItem: DataItem,
    public readonly relayer: Buffer
  ) {}

  static parse(json: JsonQuexMessage): QuexMessage {
    return new QuexMessage(
      Buffer.from(json.action_id, "base64"),
      DataItem.parse(json.data_item),
      hexToBuffer(json.relayer)
    );
  }

  toBytes(): Buffer {
    return Buffer.concat([
      enc.bytes(this.actionId),
      enc.bytes(this.relayer),
      this.dataItem.toBytes(),
    ]);
  }
}

class QuexResponse {
  constructor(
    public readonly message: QuexMessage,
    public readonly signature: Buffer
  ) {}

  static parse(json: JsonQuexResponse): QuexResponse {
    return new QuexResponse(
      QuexMessage.parse(json.msg),
      Buffer.concat([
        Buffer.from(json.sig.r, "base64"),
        Buffer.from(json.sig.s, "base64"),
        Buffer.from([json.sig.v]),
      ])
    );
  }

  toBytes(): Buffer {
    return Buffer.concat([this.message.toBytes(), enc.bytes(this.signature)]);
  }
}

export {
  ANY_TD_ADDRESS,
  HTTP_METHODS,
  HttpAction,
  HttpActionWithProof,
  HttpMethodName,
  HttpPrivatePatch,
  HttpRequest,
  JsonQuexResponse,
  QueryParameter,
  QueryParameterPatch,
  QuexResponse,
  RequestHeader,
  RequestHeaderPatch,
  DataItem,
  UnencryptedHttpPrivatePatch,
};
