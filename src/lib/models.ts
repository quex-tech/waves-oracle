import { getPublicKey } from "@noble/secp256k1";
import { base58Decode, base58Encode, keccak } from "@waves/ts-lib-crypto";
import { URL } from "node:url";
import { encrypt } from "./crypto.js";

export const HTTP_METHODS = {
  GET: 0,
  POST: 1,
  PATCH: 2,
  DELETE: 3,
  OPTIONS: 4,
  TRACE: 5,
} as const;

const HTTP_METHOD_NAMES = Object.entries(HTTP_METHODS)
  .sort((a, b) => a[1] - b[1])
  .map(([name]) => name as HttpMethodName);

export const ANY_TD_ADDRESS = "0x0000000000000000000000000000000000000000";

export type HttpMethodName = keyof typeof HTTP_METHODS;

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

type Reader = {
  i64: () => number;
  bytes: () => Buffer;
  str: () => string;
  list: <T>(readItem: () => T) => T[];
};

const dec = {
  from(buf: Buffer): Reader {
    let offset = 0;

    const i64 = (): number => {
      const value = Number(buf.readBigInt64BE(offset));
      offset += 8;
      return value;
    };

    const bytes = (): Buffer => {
      const length = i64();
      const value = buf.subarray(offset, offset + length);
      offset += length;
      return value;
    };

    const str = (): string => bytes().toString("utf8");

    const list = <T>(readItem: () => T): T[] => {
      const count = i64();
      const items = new Array<T>(count);
      for (let i = 0; i < count; i++) {
        items[i] = readItem();
      }
      return items;
    };

    return { i64, bytes, str, list };
  },
};

export class RequestHeader {
  constructor(
    public readonly key: string,
    public readonly value: string,
  ) {}

  static fromString(str: string): RequestHeader {
    const [key, value] = str.split(":");
    return new RequestHeader(key.trim(), value.trim());
  }

  static fromReader(reader: Reader) {
    return new RequestHeader(reader.str(), reader.str());
  }

  toBytes(): Buffer {
    return Buffer.concat([enc.str(this.key), enc.str(this.value)]);
  }
}

export class QueryParameter {
  constructor(
    public readonly key: string,
    public readonly value: string,
  ) {}

  static fromReader(reader: Reader) {
    return new QueryParameter(reader.str(), reader.str());
  }

  toBytes(): Buffer {
    return Buffer.concat([enc.str(this.key), enc.str(this.value)]);
  }
}

export class HttpRequest {
  constructor(
    public readonly method: HttpMethodName,
    public readonly host: string,
    public readonly path: string,
    public readonly headers: RequestHeader[],
    public readonly parameters: QueryParameter[],
    public readonly body: string,
  ) {}

  static fromParts(
    method: HttpMethodName,
    url: string,
    headers: string[],
    body: string,
  ) {
    const parsedUrl = new URL(url);
    return new HttpRequest(
      method,
      parsedUrl.hostname,
      parsedUrl.pathname,
      headers.map((header) => RequestHeader.fromString(header)),
      Array.from(
        parsedUrl.searchParams,
        ([key, value]) => new QueryParameter(key, value),
      ),
      body,
    );
  }

  static fromReader(reader: Reader) {
    return new HttpRequest(
      HTTP_METHOD_NAMES[reader.i64()],
      reader.str(),
      reader.str(),
      reader.list(() => RequestHeader.fromReader(reader)),
      reader.list(() => QueryParameter.fromReader(reader)),
      reader.str(),
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

  formatMethodAndUrl(): string {
    const baseUrl = `https://${this.host}${this.path}`;
    const params = this.parameters;
    if (params.length === 0) {
      return `${this.method} ${baseUrl}`;
    }
    let query = "";
    for (let i = 0; i < params.length; i++) {
      const param = params[i];
      if (i > 0) query += "&";
      query += `${encodeURIComponent(param.key)}=${encodeURIComponent(
        param.value,
      )}`;
    }
    return `${this.method} ${baseUrl}?${query}`;
  }
}

export class RequestHeaderPatch {
  constructor(
    public readonly key: string,
    public readonly ciphertext: Buffer,
  ) {}

  toBytes(): Buffer {
    return Buffer.concat([enc.str(this.key), enc.bytes(this.ciphertext)]);
  }

  static fromReader(reader: Reader) {
    return new RequestHeaderPatch(reader.str(), reader.bytes());
  }
}

export class QueryParameterPatch {
  constructor(
    public readonly key: string,
    public readonly ciphertext: Buffer,
  ) {}

  toBytes(): Buffer {
    return Buffer.concat([enc.str(this.key), enc.bytes(this.ciphertext)]);
  }

  static fromReader(reader: Reader) {
    return new QueryParameterPatch(reader.str(), reader.bytes());
  }
}

export class HttpPrivatePatch {
  constructor(
    public readonly pathSuffix: Buffer,
    public readonly headers: RequestHeaderPatch[],
    public readonly parameters: QueryParameterPatch[],
    public readonly body: Buffer,
    public readonly tdAddress: string,
  ) {}

  static empty(): HttpPrivatePatch {
    return new HttpPrivatePatch(
      Buffer.alloc(0),
      [],
      [],
      Buffer.alloc(0),
      ANY_TD_ADDRESS,
    );
  }

  static fromReader(reader: Reader) {
    return new HttpPrivatePatch(
      reader.bytes(),
      reader.list(() => RequestHeaderPatch.fromReader(reader)),
      reader.list(() => QueryParameterPatch.fromReader(reader)),
      reader.bytes(),
      reader.str(),
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

export class UnencryptedHttpPrivatePatch {
  constructor(
    public readonly pathSuffix: Buffer | null,
    public readonly headers: RequestHeader[],
    public readonly parameters: QueryParameter[],
    public readonly body: Buffer | null,
  ) {}

  static empty() {
    return new UnencryptedHttpPrivatePatch(
      Buffer.alloc(0),
      [],
      [],
      Buffer.alloc(0),
    );
  }

  static fromParts(
    urlSuffix: string | null,
    headers: string[] | null,
    body: string | null,
  ): UnencryptedHttpPrivatePatch {
    const parsedHeaders = (headers || []).map((header) =>
      RequestHeader.fromString(header),
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
            ([key, value]) => new QueryParameter(key, value),
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
      body != null ? Buffer.from(body, "utf8") : null,
    );
  }

  encrypt(
    encryptFunc: (data: Buffer) => Buffer,
    tdAddress: string,
  ): HttpPrivatePatch {
    const headers = this.headers.map(
      (h) =>
        new RequestHeaderPatch(
          h.key,
          encryptFunc(Buffer.from(h.value, "utf8")),
        ),
    );
    const parameters = this.parameters.map(
      (p) =>
        new QueryParameterPatch(
          p.key,
          encryptFunc(Buffer.from(p.value, "utf8")),
        ),
    );

    const encryptOrEmpty = (value?: Buffer | null): Buffer =>
      value && value.length ? encryptFunc(value) : Buffer.alloc(0);

    return new HttpPrivatePatch(
      encryptOrEmpty(this.pathSuffix),
      headers,
      parameters,
      encryptOrEmpty(this.body),
      tdAddress,
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
    public readonly filter: string,
  ) {}

  encrypt(tdPublicKey: Buffer, tdAddress: string, senderPrivKey: Uint8Array) {
    const patch = this.patch.isEmpty()
      ? HttpPrivatePatch.empty()
      : this.patch.encrypt(
          (x) => encrypt(x, tdPublicKey, senderPrivKey),
          tdAddress,
        );
    return new HttpAction(this.request, patch, this.schema, this.filter);
  }
}

export class HttpAction {
  constructor(
    public readonly request: HttpRequest,
    public readonly patch: HttpPrivatePatch,
    public readonly schema: string,
    public readonly filter: string,
  ) {}

  static fromReader(reader: Reader) {
    return new HttpAction(
      HttpRequest.fromReader(reader),
      HttpPrivatePatch.fromReader(reader),
      reader.str(),
      reader.str(),
    );
  }

  static fromBytes(buf: Buffer) {
    return this.fromReader(dec.from(buf));
  }

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
    senderPrivKey: Uint8Array,
  ): HttpActionWithProof {
    if (this.patch.isEmpty()) {
      return this.addEmptyProof();
    }

    return new HttpActionWithProof(
      this,
      Buffer.concat([
        getPublicKey(senderPrivKey, false).slice(1),
        encrypt(this.getActionId(), recipientPubKey, senderPrivKey),
      ]),
    );
  }

  addEmptyProof() {
    return new HttpActionWithProof(this, Buffer.alloc(0));
  }
}

export class HttpActionWithProof {
  constructor(
    public readonly action: HttpAction,
    public readonly proof: Buffer,
  ) {}

  static fromReader(reader: Reader) {
    return new HttpActionWithProof(
      HttpAction.fromReader(reader),
      reader.bytes(),
    );
  }

  static fromBytes(buf: Buffer) {
    return this.fromReader(dec.from(buf));
  }

  toBytes(): Buffer {
    return Buffer.concat([this.action.toBytes(), enc.bytes(this.proof)]);
  }
}

export class DataItem {
  constructor(
    public readonly timestamp: number,
    public readonly error: number,
    public readonly value: Buffer,
  ) {}

  static fromBytes(buf: Buffer): DataItem {
    return this.fromReader(dec.from(buf));
  }

  static fromReader(reader: Reader) {
    return new DataItem(reader.i64(), reader.i64(), reader.bytes());
  }

  toBytes(): Buffer {
    return Buffer.concat([
      enc.i64(this.timestamp),
      enc.i64(this.error),
      enc.bytes(this.value),
    ]);
  }
}

export class QuexMessage {
  constructor(
    public readonly actionId: Buffer,
    public readonly dataItem: DataItem,
    public readonly relayer: Buffer,
  ) {}

  toBytes(): Buffer {
    return Buffer.concat([
      enc.bytes(this.actionId),
      enc.bytes(this.relayer),
      this.dataItem.toBytes(),
    ]);
  }
}

export class QuexResponse {
  constructor(
    public readonly message: QuexMessage,
    public readonly signature: Buffer,
  ) {}

  toBytes(): Buffer {
    return Buffer.concat([this.message.toBytes(), enc.bytes(this.signature)]);
  }
}

export class Quote {
  constructor(
    public readonly header: QuoteHeader,
    public readonly body: QuoteBody,
    public readonly signatureData: QuoteSignatureData,
  ) {}
}

export class QuoteHeader {
  constructor(
    public readonly version: number,
    public readonly attestationKeyType: number,
    public readonly teeType: number,
    public readonly qeVendorId: Buffer,
    public readonly userData: Buffer,
  ) {}

  static fromBytes(buf: Buffer) {
    return new QuoteHeader(
      buf.readInt16LE(),
      buf.readInt16LE(2),
      buf.readInt32LE(4),
      buf.subarray(12, 28),
      buf.subarray(28, 48),
    );
  }

  toBytes() {
    const res = Buffer.alloc(48);
    res.writeInt16LE(this.version);
    res.writeInt16LE(this.attestationKeyType, 2);
    res.writeInt32LE(this.teeType, 4);
    this.qeVendorId.copy(res, 12);
    this.userData.copy(res, 28);
    return res;
  }
}

export class QuoteBody {
  constructor(
    public readonly tcbSvn: Buffer,
    public readonly mrSeam: Buffer,
    public readonly mrSignerSeam: Buffer,
    public readonly seamAttributes: Buffer,
    public readonly tdAttributes: Buffer,
    public readonly xfam: Buffer,
    public readonly mrtd: Buffer,
    public readonly mrConfigId: Buffer,
    public readonly mrOwner: Buffer,
    public readonly mrOwnerConfig: Buffer,
    public readonly rtmr: Buffer[],
    public readonly reportData: Buffer,
  ) {}

  static fromBytes(buf: Buffer) {
    return new QuoteBody(
      buf.subarray(0, 16),
      buf.subarray(16, 64),
      buf.subarray(64, 112),
      buf.subarray(112, 120),
      buf.subarray(120, 128),
      buf.subarray(128, 136),
      buf.subarray(136, 184),
      buf.subarray(184, 232),
      buf.subarray(232, 280),
      buf.subarray(280, 328),
      [
        buf.subarray(328, 376),
        buf.subarray(376, 424),
        buf.subarray(424, 472),
        buf.subarray(472, 520),
      ],
      buf.subarray(520, 584),
    );
  }

  toBytes() {
    const res = Buffer.alloc(584);
    this.tcbSvn.copy(res);
    this.mrSeam.copy(res, 16);
    this.mrSignerSeam.copy(res, 64);
    this.seamAttributes.copy(res, 112);
    this.tdAttributes.copy(res, 120);
    this.xfam.copy(res, 128);
    this.mrtd.copy(res, 136);
    this.mrConfigId.copy(res, 184);
    this.mrOwner.copy(res, 232);
    this.mrOwnerConfig.copy(res, 280);
    this.rtmr[0].copy(res, 328);
    this.rtmr[1].copy(res, 376);
    this.rtmr[2].copy(res, 424);
    this.rtmr[3].copy(res, 472);
    this.reportData.copy(res, 520);
    return res;
  }
}

export class QuoteSignatureData {
  constructor(
    public readonly signature: Buffer,
    public readonly attestationKey: Buffer,
    public readonly qeCertificationData: QeCertificationData,
  ) {}
}

export class QeCertificationData {
  constructor(
    public readonly type: number,
    public readonly authData: Buffer,
    public readonly certChain: Buffer[],
    public readonly report: QeReport,
    public readonly reportSignature: Buffer,
  ) {}
}

export class QeReport {
  constructor(
    public readonly cpuSvn: Buffer,
    public readonly miscSelect: number,
    public readonly attributes: Buffer,
    public readonly mrEnclave: Buffer,
    public readonly mrSigner: Buffer,
    public readonly isvProdId: number,
    public readonly isvSvn: number,
    public readonly reportData: Buffer,
  ) {}

  static fromBytes(buf: Buffer) {
    return new QeReport(
      buf.subarray(0, 16),
      buf.readInt32LE(16),
      buf.subarray(48, 64),
      buf.subarray(64, 96),
      buf.subarray(128, 160),
      buf.readInt16LE(256),
      buf.readInt16LE(258),
      buf.subarray(320, 384),
    );
  }

  toBytes() {
    const res = Buffer.alloc(384);
    this.cpuSvn.copy(res);
    res.writeInt32LE(this.miscSelect, 16);
    this.attributes.copy(res, 48);
    this.mrEnclave.copy(res, 64);
    this.mrSigner.copy(res, 128);
    res.writeInt16LE(this.isvProdId, 256);
    res.writeInt16LE(this.isvSvn, 258);
    this.reportData.copy(res, 320);
    return res;
  }
}

export class FullPoolId {
  constructor(
    public readonly address: string,
    public readonly id: Buffer,
  ) {}

  static fromBytes(buf: Uint8Array) {
    return new FullPoolId(
      base58Encode(buf.subarray(0, 26)),
      Buffer.from(buf.subarray(26)),
    );
  }

  toBytes() {
    return Buffer.concat([base58Decode(this.address), this.id]);
  }

  formatId() {
    return this.id.length ? this.id.toString("hex") : "Default";
  }
}
