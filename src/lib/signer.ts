import { PemConverter, X509Certificate } from "@peculiar/x509";
import { base16Encode } from "@waves/ts-lib-crypto";
import {
  DataItem,
  HttpActionWithProof,
  QeCertificationData,
  QeReport,
  QuexMessage,
  QuexResponse,
  Quote,
  QuoteBody,
  QuoteHeader,
  QuoteSignatureData,
} from "./models.js";
import { removePrefix } from "./utils.js";

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

type JsonEcdsaRecoverableSignature = {
  r: string;
  s: string;
  v: number;
};

type JsonQuexResponse = {
  msg: JsonQuexMessage;
  sig: JsonEcdsaRecoverableSignature;
};

type JsonQuote = {
  quote_header: JsonQuoteHeader;
  quote_signature_data: JsonQuoteSignatureData;
  quote_signature_data_len: number;
  td_quote_body: JsonTdQuoteBody;
};

type JsonQuoteHeader = {
  attestation_key_type: number;
  qe_vendor_id: string;
  tee_type: number;
  user_data: string;
  version: number;
};

type JsonEcdsaSignature = {
  r: string;
  s: string;
};

type JsonQuoteSignatureData = {
  ecdsa_attestation_key: {
    x: string;
    y: string;
  };
  qe_certification_data: {
    certification_data: {
      qe_authentication_data: {
        data: string;
        size: number;
      };
      qe_certification_data: {
        certification_data: string;
        certification_data_type: number;
        size: number;
      };
      qe_report: {
        attributes: string;
        cpu_svn: string;
        isv_prodID: number;
        isv_svn: number;
        miscselect: number;
        mrenclave: string;
        mrsigner: string;
        report_data: string;
      };
      qe_report_signature: JsonEcdsaSignature;
    };
    certification_data_type: number;
    size: number;
  };
  quote_signature: JsonEcdsaSignature;
};

type JsonTdQuoteBody = {
  mrconfigid: string;
  mrowner: string;
  mrownerconfig: string;
  mrseam: string;
  mrsignerseam: string;
  mrtd: string;
  reportdata: string;
  rtmr0: string;
  rtmr1: string;
  rtmr2: string;
  rtmr3: string;
  seamattributes: string;
  tcb_svn: string;
  tdattributes: string;
  xfam: string;
};

export class SignerClient {
  constructor(private readonly url: string) {}

  async query(
    action: HttpActionWithProof,
    relayer: Uint8Array,
  ): Promise<QuexResponse> {
    const res = await fetch(new URL("/query", this.url), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: action.toBytes().toString("base64"),
        relayer: base16Encode(relayer),
        format: "ride",
      }),
    });
    if (!res.ok) {
      throw new Error(
        `Failed to query signer: ${res.status} ${res.statusText}`,
      );
    }
    const body = (await res.json()) as JsonQuexResponse;
    return parseQuexResponse(body);
  }

  async publicKey(): Promise<Buffer> {
    const res = await fetch(new URL("/pubkey", this.url));
    if (!res.ok) {
      throw new Error(
        `Failed to get signer's public key: ${res.status} ${res.statusText}`,
      );
    }
    return hexToBuffer(await res.text());
  }

  async address(): Promise<string> {
    const res = await fetch(new URL("/address", this.url));
    if (!res.ok) {
      throw new Error(
        `Failed to get signer's address: ${res.status} ${res.statusText}`,
      );
    }
    return await res.text();
  }

  async quote(): Promise<Quote> {
    const res = await fetch(new URL("/quote", this.url));
    if (!res.ok) {
      throw new Error(
        `Failed to get signer's quote: ${res.status} ${res.statusText}`,
      );
    }
    return parseQuote((await res.json()) as JsonQuote);
  }
}

function parseQuexResponse(json: JsonQuexResponse): QuexResponse {
  return new QuexResponse(
    new QuexMessage(
      b64(json.msg.action_id),
      new DataItem(
        json.msg.data_item.timestamp,
        json.msg.data_item.error,
        b64(json.msg.data_item.value),
      ),
      hexToBuffer(json.msg.relayer),
    ),
    Buffer.concat([
      b64(json.sig.r),
      b64(json.sig.s),
      Buffer.from([json.sig.v]),
    ]),
  );
}

function parseQuote(json: JsonQuote): Quote {
  return new Quote(
    new QuoteHeader(
      json.quote_header.version,
      json.quote_header.attestation_key_type,
      json.quote_header.tee_type,
      b64(json.quote_header.qe_vendor_id),
      b64(json.quote_header.user_data),
    ),
    new QuoteBody(
      b64(json.td_quote_body.tcb_svn),
      b64(json.td_quote_body.mrseam),
      b64(json.td_quote_body.mrsignerseam),
      b64(json.td_quote_body.seamattributes),
      b64(json.td_quote_body.tdattributes),
      b64(json.td_quote_body.xfam),
      b64(json.td_quote_body.mrtd),
      b64(json.td_quote_body.mrconfigid),
      b64(json.td_quote_body.mrowner),
      b64(json.td_quote_body.mrownerconfig),
      [
        b64(json.td_quote_body.rtmr0),
        b64(json.td_quote_body.rtmr1),
        b64(json.td_quote_body.rtmr2),
        b64(json.td_quote_body.rtmr3),
      ],
      b64(json.td_quote_body.reportdata),
    ),
    new QuoteSignatureData(
      Buffer.concat([
        b64(json.quote_signature_data.quote_signature.r),
        b64(json.quote_signature_data.quote_signature.s),
      ]),
      Buffer.concat([
        b64(json.quote_signature_data.ecdsa_attestation_key.x),
        b64(json.quote_signature_data.ecdsa_attestation_key.y),
      ]),
      new QeCertificationData(
        json.quote_signature_data.qe_certification_data.certification_data_type,
        b64(
          json.quote_signature_data.qe_certification_data.certification_data
            .qe_authentication_data.data,
        ),
        parsePemChain(
          b64(
            json.quote_signature_data.qe_certification_data.certification_data
              .qe_certification_data.certification_data,
          ),
        ),
        new QeReport(
          b64(
            json.quote_signature_data.qe_certification_data.certification_data
              .qe_report.cpu_svn,
          ),
          json.quote_signature_data.qe_certification_data.certification_data
            .qe_report.miscselect,
          b64(
            json.quote_signature_data.qe_certification_data.certification_data
              .qe_report.attributes,
          ),
          b64(
            json.quote_signature_data.qe_certification_data.certification_data
              .qe_report.mrenclave,
          ),
          b64(
            json.quote_signature_data.qe_certification_data.certification_data
              .qe_report.mrsigner,
          ),
          json.quote_signature_data.qe_certification_data.certification_data
            .qe_report.isv_prodID,
          json.quote_signature_data.qe_certification_data.certification_data
            .qe_report.isv_svn,
          b64(
            json.quote_signature_data.qe_certification_data.certification_data
              .qe_report.report_data,
          ),
        ),
        Buffer.concat([
          b64(
            json.quote_signature_data.qe_certification_data.certification_data
              .qe_report_signature.r,
          ),
          b64(
            json.quote_signature_data.qe_certification_data.certification_data
              .qe_report_signature.s,
          ),
        ]),
      ),
    ),
  );
}

export function parsePemChain(pemChain: Buffer): X509Certificate[] {
  const pem = pemChain.toString("utf8");

  const blocks = PemConverter.decodeWithHeaders(pem);

  return blocks
    .filter((b) => b.type === PemConverter.CertificateTag)
    .map((b) => new X509Certificate(b.rawData));
}

function b64(str: string) {
  return Buffer.from(str, "base64");
}

function hexToBuffer(hex: string): Buffer {
  return Buffer.from(removePrefix(hex, "0x"), "hex");
}
