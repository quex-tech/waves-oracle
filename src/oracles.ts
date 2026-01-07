import { base58Decode, base58Encode } from "@waves/ts-lib-crypto";
import { data } from "@waves/waves-transactions";
import { accountData } from "@waves/waves-transactions/dist/nodeInteraction.js";
import { parseArgs } from "util";
import { FullPoolId } from "./lib/models.js";
import { chainId, nodeUrl } from "./lib/network.js";
import { SignerClient } from "./lib/signer.js";
import { handleTx } from "./lib/utils.js";
import { oracles } from "./lib/wallets.js";

const [command, ...rest] = process.argv.slice(2);

switch (command) {
  case "add":
    await add(rest);
    break;
  case "delete":
    await del(rest);
    break;
  case "list":
    await list();
    break;
  default:
    console.log(
      `Usage: ${process.argv[0]} ${process.argv[1]} add|delete|list|check`,
    );
    break;
}

async function add(args: string[]) {
  const { values, positionals } = parseArgs({
    args: args,
    options: {
      apply: {
        type: "boolean",
      },
      "pool-id": {
        type: "string",
        default: "",
      },
    },
    allowPositionals: true,
  });

  await handleTx(
    data(
      {
        data: [
          {
            key: makeKey(
              values["pool-id"],
              await new SignerClient(positionals[0]).publicKey(),
            ),
            type: "boolean",
            value: true,
          },
        ],
        chainId: chainId,
      },
      oracles.seed,
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
      "pool-id": {
        type: "string",
        default: "",
      },
    },
    allowPositionals: true,
  });

  await handleTx(
    data(
      {
        data: [
          {
            key: makeKey(
              values["pool-id"],
              await new SignerClient(positionals[0]).publicKey(),
            ),
          }
        ],
        chainId: chainId,
      },
      oracles.seed,
    ),
    Boolean(values.apply),
  );
}

async function list() {
  const data = await accountData({ address: oracles.address }, nodeUrl);
    console.log(`Pool Address:    ${oracles.address}
Oracles:`);
  for (const [key, val] of Object.entries(data)) {
    if (!val.value) {
      continue;
    }
    const [poolId, pk] = key.split(":");
    const fullPoolId = new FullPoolId(
      oracles.address,
      Buffer.from(base58Decode(poolId)),
    );
    console.log(`  - Public Key:  ${Buffer.from(base58Decode(pk)).toString("hex")}
    Pool ID:     ${fullPoolId.formatId()}`);
  }
}

function makeKey(pool: string, pk: Buffer) {
  return `${base58Encode(Buffer.from(pool, "hex"))}:${base58Encode(pk)}`;
}
