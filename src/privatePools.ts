import { parseArgs } from "util";
import { chainId, nodeUrl } from "./lib/network.js";
import { addOracle, deleteOracle, fetchOracles } from "./lib/privatePools.js";
import { SignerClient } from "./lib/signer.js";
import { handleTx } from "./lib/utils.js";
import { privatePools, treasury } from "./lib/wallets.js";

const [command, ...rest] = process.argv.slice(2);

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
      "pool-id-suffix": {
        type: "string",
        default: "",
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
     --pool-id-suffix <hex>  Optional pool ID suffix (hex)
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

  await handleTx(
    addOracle(
      privatePools.address,
      Buffer.from(values["pool-id-suffix"], "hex"),
      await new SignerClient(positionals[0]).publicKey(),
      chainId,
      treasury,
    ),
    Boolean(values.apply),
  );
}

async function del(args: string[]) {
  const { values, positionals } = parseArgs({
    args: args,
    options: {
      apply: {
        type: "boolean",
      },
      "pool-id-suffix": {
        type: "string",
        default: "",
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
      `Usage: ${process.argv[0]} ${process.argv[1]} delete [options] <oracle-url>
     --pool-id-suffix <hex>  Optional pool ID suffix (hex)
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

  await handleTx(
    deleteOracle(
      privatePools.address,
      Buffer.from(values["pool-id-suffix"], "hex"),
      await new SignerClient(positionals[0]).publicKey(),
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

  const privateOracles = await fetchOracles(privatePools.address, nodeUrl);
  console.log(`Pool Address:    ${privatePools.address}
Oracles:`);
  for (const oracle of privateOracles) {
    console.log(`- Public Key:  ${oracle.publicKey.toString("hex")}
  Pool ID:     ${oracle.pool.formatId()}
  Owner:       ${oracle.ownerAddress}`);
  }
}
