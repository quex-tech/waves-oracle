import { parseArgs } from "util";
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
import { AttestedOracle, fetchOracles as fetchOracle } from "./lib/oracles.js";
import { SignerClient } from "./lib/signer.js";
import { RootWallet } from "./lib/wallets.js";

const [command, ...rest] = process.argv.slice(2);

function printRootHelp() {
  console.log(`Usage:
 ${getCommand()} <command>

Manages attested oracles stored on-chain

Positional arguments:
  command
    add                 Add an oracle to the attested pool
    list                List attested oracles`);
}

switch (command) {
  case "add":
    await add(rest);
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

async function add(args: string[]) {
  const options = {
    ...configOptions,
    ...chainOptions,
    ...applyOptions,
    ...helpOptions,
  } as const;

  const { values, positionals } = doOrExit(
    () =>
      parseArgs({
        args: args,
        options: options,
        allowPositionals: true,
      }),
    printHelp,
  );

  function printHelp() {
    console.log(`Usage:
 ${getCommand()} add [options] <oracle-url>

Adds an oracle to the attested pool

Positional arguments:
  oracle-url            Base URL of the oracle API

${formatOptions(options)}`);
  }

  if (values.help) {
    printHelp();
    process.exit(0);
  }
  if (!positionals[0]) {
    console.log("<oracle-url> is required");
    printHelp();
    process.exit(1);
  }

  const network = await NetworkConfig.fromArgs(values.config, values.chain);
  const nodeUrl = network.getNodeUrl();

  const quote = await new SignerClient(positionals[0]).quote();
  const wallet = RootWallet.fromEnv();
  const oracle = AttestedOracle.fromQuote(
    quote,
    network.dApps.quotes,
    network.dApps.attestedPools,
  );

  await handleTx(
    oracle.add(quote.getQuoteId(), network.chainId, wallet),
    Boolean(values.apply),
    nodeUrl,
  );
}

async function list(args: string[]) {
  const options = {
    ...configOptions,
    ...chainOptions,
    ...helpOptions,
  } as const;

  const { values } = doOrExit(
    () =>
      parseArgs({
        args: args,
        options: options,
      }),
    printHelp,
  );

  function printHelp() {
    console.log(`Usage:
 ${getCommand()} list [options]

Lists attested oracles stored on-chain

${formatOptions(options)}`);
  }

  if (values.help) {
    printHelp();
    process.exit(0);
  }

  const network = await NetworkConfig.fromArgs(values.config, values.chain);
  const nodeUrl = network.getNodeUrl();

  const attestedOracles = (
    await fetchOracle(network.dApps.attestedPools, nodeUrl, null)
  ).map((key) => AttestedOracle.parse(network.dApps.attestedPools, key));
  console.log(`Pool Address:    ${network.dApps.attestedPools}
Oracles:`);
  for (const oracle of attestedOracles) {
    console.log(`- Public Key:      ${oracle.publicKey.toString("hex")}
  Pool ID:         ${oracle.pool.formatId()}
  ID:              ${oracle.id.toString("hex")}
  Quotes Address:  ${oracle.quotesAddress}`);
  }
}
