import { base58Decode } from "@waves/ts-lib-crypto";
import { DataTransactionEntry } from "@waves/ts-types";
import { invokeScript, TSeedTypes } from "@waves/waves-transactions";
import { accountData } from "@waves/waves-transactions/dist/nodeInteraction.js";
import { QeReport, Quote, QuoteBody, QuoteHeader } from "./models.js";
import { groupFieldsByKey, parseBinaryEntry } from "./utils.js";

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

export function registerQuote(
  quote: Quote,
  dApp: string,
  chainId: string,
  seed: TSeedTypes,
) {
  return invokeScript(
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
            value: quote.signatureData.qeCertificationData.certChain.map(
              (x) => ({
                type: "binary",
                value: x.toString("base64"),
              }),
            ),
          },
        ],
      },
      chainId: chainId,
    },
    seed,
  );
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
