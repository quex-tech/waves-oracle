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
import { addOracle, deleteOracle, fetchOracles } from "./lib/privatePools.js";
import { SignerClient } from "./lib/signer.js";
import { RootWallet } from "./lib/wallets.js";

const [command, ...rest] = process.argv.slice(2);

function printRootHelp() {
  console.log(`Usage:
 ${getCommand()} <command>

Manages oracles stored in the private pool on-chain

Positional arguments:
  command
    add                 Add an oracle to the private pool
    delete              Remove an oracle from the private pool
    list                List private pool oracles`);
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
    "pool-id-suffix": {
      type: "string",
      default: "",
      valueLabel: "hex",
      description: "Optional pool ID suffix",
    },
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

Adds an oracle to the private pool

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
  await handleTx(
    addOracle(
      network.dApps.privatePools,
      Buffer.from(values["pool-id-suffix"], "hex"),
      await new SignerClient(positionals[0]).publicKey(),
      network.chainId,
      RootWallet.fromEnv(),
    ),
    Boolean(values.apply),
    nodeUrl,
  );
}

async function del(args: string[]) {
  const options = {
    ...configOptions,
    ...chainOptions,
    "pool-id-suffix": {
      type: "string",
      default: "",
      valueLabel: "hex",
      description: "Optional pool ID suffix",
    },
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

Removes an oracle from the private pool

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
  await handleTx(
    deleteOracle(
      network.dApps.privatePools,
      Buffer.from(values["pool-id-suffix"], "hex"),
      await new SignerClient(positionals[0]).publicKey(),
      network.chainId,
      RootWallet.fromEnv(),
    ),
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

Lists oracles stored in the private pool on-chain

${formatOptions(options)}`);
  }

  if (values.help) {
    printHelp();
    process.exit(0);
  }

  const network = await NetworkConfig.fromArgs(values.config, values.chain);
  const nodeUrl = network.getNodeUrl();
  const privateOracles = await fetchOracles(
    network.dApps.privatePools,
    nodeUrl,
  );
  console.log(`Pool Address:    ${network.dApps.privatePools}
Oracles:`);
  for (const oracle of privateOracles) {
    console.log(`- Public Key:  ${oracle.publicKey.toString("hex")}
  Pool ID:     ${oracle.pool.formatId()}
  Owner:       ${oracle.ownerAddress}`);
  }
}
