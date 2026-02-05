import {
  CRLDistributionPointsExtension,
  X509Certificate,
} from "@peculiar/x509";
import { base58Decode, base58Encode, sha256 } from "@waves/ts-lib-crypto";
import { DataTransactionEntry } from "@waves/ts-types";
import { invokeScript } from "@waves/waves-transactions";
import { accountData } from "@waves/waves-transactions/dist/nodeInteraction.js";
import { saveBlobs } from "./blobs.js";
import { QeReport, Quote, QuoteBody, QuoteHeader } from "./models.js";
import { groupFieldsByKey, parseBinaryEntry } from "./utils.js";
import { IWallet } from "./wallets.js";

type QuoteEntry = {
  id: Buffer;
  quote: { header: QuoteHeader; body: QuoteBody };
  qeReport: QeReport;
};

export async function fetchQuotes(address: string, nodeUrl: string) {
  const data = await accountData({ address: address }, nodeUrl);
  return Object.entries(groupFieldsByKey(data)).map(([key, value]) =>
    parseQuote(key, value),
  );
}

export async function* registerQuote(
  quote: Quote,
  dApp: string,
  chainId: string,
  wallet: IWallet,
) {
  const crls = await fetchCrls(
    quote.signatureData.qeCertificationData.certChain,
  );

  const crlsDict: Record<string, Buffer> = {};
  for (const crl of crls) {
    crlsDict[`crl:${base58Encode(Buffer.from(sha256(crl)))}`] = crl;
  }

  yield saveBlobs(crlsDict, chainId, wallet);

  yield invokeScript(
    {
      dApp: dApp,
      call: {
        function: "register",
        args: [
          {
            type: "binary",
            value: Buffer.concat([
              quote.header.toBytes(),
              quote.body.toBytes(),
            ]).toString("base64"),
          },
          {
            type: "binary",
            value: quote.signatureData.signature.toString("base64"),
          },
          {
            type: "binary",
            value: quote.signatureData.attestationKey.toString("base64"),
          },
          {
            type: "binary",
            value: quote.signatureData.qeCertificationData.report
              .toBytes()
              .toString("base64"),
          },
          {
            type: "binary",
            value:
              quote.signatureData.qeCertificationData.reportSignature.toString(
                "base64",
              ),
          },
          {
            type: "binary",
            value:
              quote.signatureData.qeCertificationData.authData.toString(
                "base64",
              ),
          },
          {
            type: "list",
            value: quote.signatureData.qeCertificationData.certChain
              .slice(
                0,
                quote.signatureData.qeCertificationData.certChain.length - 1,
              )
              .map((x) => ({
                type: "binary",
                value: x.toString("base64"),
              })),
          },
          {
            type: "binary",
            value: Buffer.from(base58Decode(wallet.address(chainId))).toString(
              "base64",
            ),
          },
          {
            type: "list",
            value: Object.keys(crlsDict).map((x) => ({
              type: "string",
              value: x,
            })),
          },
        ],
      },
      chainId: chainId,
    },
    wallet.seed,
  );
}

async function fetchCrls(certs: X509Certificate[]): Promise<Buffer[]> {
  const crlUrls = [...new Set(certs.flatMap(getCrlUrls))];
  const crls: Buffer[] = [];

  for (const url of crlUrls) {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(
        `Failed to fetch CRL from ${url}: ${res.status} ${res.statusText}`,
      );
    }

    crls.push(Buffer.from(await res.arrayBuffer()));
  }

  return crls;
}

function getCrlUrls(cert: X509Certificate): string[] {
  const ext = cert.getExtension(CRLDistributionPointsExtension);
  if (!ext) return [];

  const urls: string[] = [];

  for (const dp of ext.distributionPoints ?? []) {
    const fullName = dp.distributionPoint?.fullName;
    if (!fullName) continue;

    for (const gn of fullName) {
      const uri = gn.uniformResourceIdentifier;
      if (typeof uri === "string" && uri.length > 0) urls.push(uri);
    }
  }

  return urls;
}

function parseQuote(
  key: string,
  value: Record<string, DataTransactionEntry>,
): QuoteEntry {
  const quote = parseBinaryEntry(value.quote);
  return {
    id: Buffer.from(base58Decode(key)),
    quote: {
      header: QuoteHeader.fromBytes(quote),
      body: QuoteBody.fromBytes(quote.subarray(48)),
    },
    qeReport: QeReport.fromBytes(parseBinaryEntry(value["qe-report"])),
  };
}
