import { base58Encode } from "@waves/ts-lib-crypto";
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
import {
  AttestedWhitelistOracle,
  fetchOracles as fetchOracleKeys,
} from "./lib/oracles.js";
import { SignerClient } from "./lib/signer.js";
import { escapeRegExp } from "./lib/utils.js";
import { RootWallet } from "./lib/wallets.js";

const [command, ...rest] = process.argv.slice(2);

function printRootHelp() {
  console.log(`Usage:
 ${getCommand()} <command>

Manages attested whitelisted oracles stored on-chain

Positional arguments:
  command
    add                 Add an oracle to the attested whitelist pool
    delete              Remove an oracle from the attested whitelist pool
    list                List attested whitelisted oracles`);
}

switch (command) {
  case "add":
    await add(rest);
    break;
  case "delete":
    await del(rest);
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

Adds an oracle to the attested whitelist pool

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
  const oracle = AttestedWhitelistOracle.fromQuote(
    quote,
    wallet.address(network.chainId),
    network.dApps.quotes,
    network.dApps.attestedWhitelistPools,
  );

  await handleTx(
    oracle.add(
      quote.getQuoteId(),
      network.dApps.quotes,
      network.chainId,
      wallet,
    ),
    Boolean(values.apply),
    nodeUrl,
  );
}

async function del(args: string[]) {
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
 ${getCommand()} delete [options] <oracle-url>

Removes an oracle from the attested whitelist pool

Positional arguments:
  oracle-url                  Base URL of the oracle API

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
  const wallet = RootWallet.fromEnv();
  const quote = await new SignerClient(positionals[0]).quote();
  const oracle = AttestedWhitelistOracle.fromQuote(
    quote,
    wallet.address(network.chainId),
    network.dApps.quotes,
    network.dApps.attestedWhitelistPools,
  );

  await handleTx(
    oracle.delete(network.chainId, wallet),
    Boolean(values.apply),
    nodeUrl,
  );
}

async function list(args: string[]) {
  const options = {
    ...configOptions,
    ...chainOptions,
    all: {
      type: "boolean",
      description: "List all oracles, including owned by others",
    },
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

Lists attested whitelisted oracles stored on-chain

${formatOptions(options)}`);
  }

  if (values.help) {
    printHelp();
    process.exit(0);
  }

  const network = await NetworkConfig.fromArgs(values.config, values.chain);
  const nodeUrl = network.getNodeUrl();

  const ownerAddress = values.all
    ? null
    : RootWallet.fromEnv().address(values.chain);
  const match = ownerAddress ? `${escapeRegExp(ownerAddress)}:.*` : null;
  const attestedOracles = (
    await fetchOracleKeys(network.dApps.attestedWhitelistPools, nodeUrl, match)
  ).map((key) =>
    AttestedWhitelistOracle.parse(network.dApps.attestedWhitelistPools, key),
  );
  console.log(`Pool Address:    ${network.dApps.attestedWhitelistPools}
Oracles:`);
  for (const oracle of attestedOracles) {
    console.log(`- Public Key:      ${oracle.publicKey.toString("hex")}
  Pool ID:         ${oracle.pool.formatId()}
  ID:              ${base58Encode(oracle.id)}
  Owner Address:   ${oracle.ownerAddress}`);
  }
}
