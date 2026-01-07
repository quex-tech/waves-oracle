import { parseArgs } from "util";
import { addOracle, fetchOracles } from "./lib/attestedPools.js";
import { chainId, nodeUrl } from "./lib/network.js";
import { SignerClient } from "./lib/signer.js";
import { handleTx } from "./lib/utils.js";
import { attestedPools, quotes, treasury } from "./lib/wallets.js";

const [command, ...rest] = process.argv.slice(2);

switch (command) {
  case "add":
    await add(rest);
    break;
  case "list":
    await list(rest);
    break;
  default:
    console.log(`Usage: ${process.argv[0]} ${process.argv[1]} add|delete|list`);
    break;
}

async function add(args: string[]) {
  const { values, positionals } = parseArgs({
    args: args,
    options: {
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
      `Usage: ${process.argv[0]} ${process.argv[1]} add [options] <oracle-url>
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

  const quote = await new SignerClient(positionals[0]).quote();

  await handleTx(
    addOracle(
      quotes.address,
      quote.getQuoteId(),
      attestedPools.address,
      chainId,
      treasury,
    ),
    Boolean(values.apply),
  );
}

async function list(args: string[]) {
  const { values } = parseArgs({
    args: args,
    options: {
      help: {
        type: "boolean",
        short: "h",
      },
    },
  });
  function printHelp() {
    console.log(
      `Usage: ${process.argv[0]} ${process.argv[1]} list [options]
 -h, --help                 Show this help message and exit`,
    );
  }
  if (values.help) {
    printHelp();
    process.exit(0);
  }

  const attestedOracles = await fetchOracles(attestedPools.address, nodeUrl);
  console.log(`Pool Address:    ${attestedPools.address}
Oracles:`);
  for (const oracle of attestedOracles) {
    console.log(`- Public Key:      ${oracle.publicKey.toString("hex")}
  Pool ID:         ${oracle.pool.formatId()}
  ID:              ${oracle.id.toString("hex")}
  Quotes Address:  ${oracle.quotesAddress}`);
  }
}
