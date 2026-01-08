import { parseArgs } from "util";
import { handleTx } from "./cliUtils.js";
import { addOracle, fetchOracles } from "./lib/attestedPools.js";
import { NetworkConfig } from "./lib/config.js";
import { SignerClient } from "./lib/signer.js";
import { wallet } from "./lib/wallets.js";

const [command, ...rest] = process.argv.slice(2);

switch (command) {
  case "add":
    await add(rest);
    break;
  case "list":
    await list(rest);
    break;
  default:
    console.log(`Usage: ${process.argv[0]} ${process.argv[1]} add|list`);
    break;
}

async function add(args: string[]) {
  const { values, positionals } = parseArgs({
    args: args,
    options: {
      apply: {
        type: "boolean",
      },
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
    allowPositionals: true,
  });
  function printHelp() {
    console.log(
      `Usage: ${process.argv[0]} ${process.argv[1]} add [options] <oracle-url>
     --chain <id>            Chain ID. Default: R
     --apply                 Actually submit the transactions
 -h, --help                  Show this help message and exit`,
    );
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

  await handleTx(
    addOracle(
      network.dApps.quotes,
      quote.getQuoteId(),
      network.dApps.attestedPools,
      network.chainId,
      wallet,
    ),
    Boolean(values.apply),
    nodeUrl,
  );
}

async function list(args: string[]) {
  const { values } = parseArgs({
    args: args,
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
     --config <path>        Path to config.json. Default: ./config.json
     --chain <id>           Chain ID. Default: R
 -h, --help                 Show this help message and exit`,
    );
  }
  if (values.help) {
    printHelp();
    process.exit(0);
  }

  const network = await NetworkConfig.fromArgs(values.config, values.chain);
  const nodeUrl = network.getNodeUrl();

  const attestedOracles = await fetchOracles(
    network.dApps.attestedPools,
    nodeUrl,
  );
  console.log(`Pool Address:    ${network.dApps.attestedPools}
Oracles:`);
  for (const oracle of attestedOracles) {
    console.log(`- Public Key:      ${oracle.publicKey.toString("hex")}
  Pool ID:         ${oracle.pool.formatId()}
  ID:              ${oracle.id.toString("hex")}
  Quotes Address:  ${oracle.quotesAddress}`);
  }
}
