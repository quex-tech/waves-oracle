import { base58Encode } from "@waves/ts-lib-crypto";
import { parseArgs } from "node:util";
import { chainId, nodeUrl } from "./lib/network.js";
import { fetchQuotes, registerQuote } from "./lib/quotes.js";
import { SignerClient } from "./lib/signer.js";
import { handleTx } from "./lib/utils.js";
import { quotes as quotesWallet, treasury } from "./lib/wallets.js";

const [command, ...rest] = process.argv.slice(2);

switch (command) {
  case "register":
    await register(rest);
    break;
  case "list":
    await list();
    break;
  default:
    console.log(`Usage: ${process.argv[0]} ${process.argv[1]} register|list`);
    break;
}

async function register(rest: string[]) {
  const { values } = parseArgs({
    args: rest,
    options: {
      "oracle-url": {
        type: "string",
        default: process.env["ORACLE_URL"],
      },
      apply: {
        type: "boolean",
      },
      help: {
        type: "boolean",
        short: "h",
      },
    },
  });
  function printHelp() {
    console.log(
      `Usage: ${process.argv[0]} ${process.argv[1]} register [options]
     --oracle-url <url>  Base URL of the oracle API
     --apply             Actually submit the transactions
 -h, --help              Show this help message and exit`,
    );
  }
  if (values.help) {
    printHelp();
    process.exit(0);
  }
  const oracleUrl = values["oracle-url"];
  if (!oracleUrl) {
    console.log("--oracle-url is required");
    printHelp();
    process.exit(1);
  }

  const quote = await new SignerClient(oracleUrl).quote();
  await handleTx(
    registerQuote(quote, quotesWallet.address, chainId, treasury.seed),
    Boolean(values.apply),
  );
}

async function list() {
  const quotes = await fetchQuotes(quotesWallet.address, nodeUrl);
  for (const quote of quotes) {
    console.log(`- Id: ${base58Encode(quote.id)}
  Quote:
    Version:              ${quote.quote.header.version}
    Attestation Key Type: ${quote.quote.header.attestationKeyType}
    TEE Type:             ${quote.quote.header.teeType}
    QE Vendor ID:         ${quote.quote.header.qeVendorId.toString("hex")}
    User Data:            ${quote.quote.header.userData.toString("hex")}
    TEE TCB SVN:          ${quote.quote.body.tcbSvn.toString("hex")}
    MRSEAM:               ${quote.quote.body.mrSeam.toString("hex")}
    MRSIGNERSEAM:         ${quote.quote.body.mrSignerSeam.toString("hex")}
    SEAM Attributes:      ${quote.quote.body.seamAttributes.toString("hex")}
    TD Attributes:        ${quote.quote.body.tdAttributes.toString("hex")}
    XFAM:                 ${quote.quote.body.xfam.toString("hex")}
    MRTD:                 ${quote.quote.body.mrtd.toString("hex")}
    MRCONFIGID:           ${quote.quote.body.mrConfigId.toString("hex")}
    MROWNER:              ${quote.quote.body.mrOwner.toString("hex")}
    MROWNERCONFIG:        ${quote.quote.body.mrOwnerConfig.toString("hex")}
    RTMR0:                ${quote.quote.body.rtmr[0].toString("hex")}
    RTMR1:                ${quote.quote.body.rtmr[1].toString("hex")}
    RTMR2:                ${quote.quote.body.rtmr[2].toString("hex")}
    RTMR3:                ${quote.quote.body.rtmr[3].toString("hex")}
    Report Data:          ${quote.quote.body.reportData.toString("hex")}
  QE Report:
    CPU SVN:              ${quote.qeReport.cpuSvn.toString("hex")}
    MISCSELECT:           ${quote.qeReport.miscSelect}
    Attributes:           ${quote.qeReport.attributes.toString("hex")}
    MRENCLAVE:            ${quote.qeReport.mrEnclave.toString("hex")}
    MRSIGNER:             ${quote.qeReport.mrSigner.toString("hex")}
    ISV ProdID:           ${quote.qeReport.isvProdId}
    ISV SVN:              ${quote.qeReport.isvSvn}
    Report Data:          ${quote.qeReport.reportData.toString("hex")}`);
  }
}
