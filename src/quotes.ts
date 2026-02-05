import { base58Encode } from "@waves/ts-lib-crypto";
import { parseArgs } from "node:util";
import {
  applyOptions,
  chainOptions,
  configOptions,
  doOrExit,
  formatOptions,
  getCommand,
  handleTx,
  helpOptions,
} from "./cliUtils.js";
import { NetworkConfig } from "./lib/config.js";
import { fetchQuotes, registerQuote } from "./lib/quotes.js";
import { SignerClient } from "./lib/signer.js";
import { RootWallet } from "./lib/wallets.js";

const [command, ...rest] = process.argv.slice(2);

function printRootHelp() {
  console.log(`Usage:
 ${getCommand()} <command>

Manages TD quotes stored on-chain

Positional arguments:
  command
    register                     Register a new quote
    list                         List registered quotes`);
}

switch (command) {
  case "register":
    await register(rest);
    break;
  case "list":
    await list(rest);
    break;
  case "-h":
  case "--help":
  case undefined:
    printRootHelp();
    break;
  default:
    printRootHelp();
    break;
}

async function register(rest: string[]) {
  const options = {
    ...configOptions,
    ...chainOptions,
    ...applyOptions,
    ...helpOptions,
  } as const;

  const { values, positionals } = doOrExit(
    () =>
      parseArgs({
        args: rest,
        options: options,
        allowPositionals: true,
      }),
    printHelp,
  );

  function printHelp() {
    console.log(`Usage:
 ${getCommand()} register [options] <oracle-url>

Registers a TD quote on-chain

Positional arguments:
  oracle-url                    Base URL of the oracle API

${formatOptions(options)}`);
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
  const wallet = RootWallet.fromEnv();
  for await (const tx of registerQuote(
    quote,
    network.dApps.quotes,
    network.chainId,
    wallet,
  )) {
    await handleTx(tx, Boolean(values.apply), nodeUrl);
  }
}

async function list(rest: string[]) {
  const options = {
    ...configOptions,
    ...chainOptions,
    ...helpOptions,
  } as const;

  const { values } = doOrExit(
    () =>
      parseArgs({
        args: rest,
        options: options,
      }),
    printHelp,
  );

  function printHelp() {
    console.log(`Usage:
 ${getCommand()} list [options]

Lists registered TD quotes

${formatOptions(options)}`);
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
