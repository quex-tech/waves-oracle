import { base58Encode } from "@waves/ts-lib-crypto";
import { parseArgs } from "node:util";
import { handleTx } from "./cliUtils.js";
import { NetworkConfig } from "./lib/config.js";
import { fetchQuotes, registerQuote } from "./lib/quotes.js";
import { SignerClient } from "./lib/signer.js";
import { RootWallet } from "./lib/wallets.js";

const [command, ...rest] = process.argv.slice(2);

switch (command) {
  case "register":
    await register(rest);
    break;
  case "list":
    await list(rest);
    break;
  default:
    console.log(`Usage: ${process.argv[0]} ${process.argv[1]} register|list`);
    break;
}

async function register(rest: string[]) {
  const { values, positionals } = parseArgs({
    args: rest,
    options: {
      config: {
        type: "string",
        default: "./config.json",
      },
      chain: {
        type: "string",
        default: "R",
      },
      apply: {
        type: "boolean",
      },
      help: {
        type: "boolean",
        short: "h",
      },
    },
    allowPositionals: true,
  });
  function printHelp() {
    console.log(
      `Usage: ${process.argv[0]} ${process.argv[1]} register [options] <oracle-url>
     --config <path>     Path to config.json. Default: ./config.json
     --chain <id>        Chain ID. Default: R
     --apply             Actually submit the transactions
 -h, --help              Show this help message and exit`,
    );
  }
  if (values.help) {
    printHelp();
    process.exit(0);
  }
  const oracleUrl = positionals[0];
  if (!oracleUrl) {
    console.log("<oracle-url> is required");
    printHelp();
    process.exit(1);
  }

  const network = await NetworkConfig.fromArgs(values.config, values.chain);
  const nodeUrl = network.getNodeUrl();
  const quote = await new SignerClient(oracleUrl).quote();
  await handleTx(
    registerQuote(
      quote,
      network.dApps.quotes,
      network.chainId,
      RootWallet.fromEnv().seed,
    ),
    Boolean(values.apply),
    nodeUrl,
  );
}

async function list(rest: string[]) {
  const { values } = parseArgs({
    args: rest,
    options: {
      config: {
        type: "string",
        default: "./config.json",
      },
      chain: {
        type: "string",
        default: "R",
      },
      help: {
        type: "boolean",
        short: "h",
      },
    },
  });
  function printHelp() {
    console.log(
      `Usage: ${process.argv[0]} ${process.argv[1]} list [options]
     --config <path>     Path to config.json. Default: ./config.json
     --chain <id>        Chain ID. Default: R
 -h, --help              Show this help message and exit`,
    );
  }
  if (values.help) {
    printHelp();
    process.exit(0);
  }
  const network = await NetworkConfig.fromArgs(values.config, values.chain);
  const nodeUrl = network.getNodeUrl();
  const quotes = await fetchQuotes(network.dApps.quotes, nodeUrl);
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
