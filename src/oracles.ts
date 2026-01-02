import { base58Decode, base58Encode } from "@waves/ts-lib-crypto";
import { data } from "@waves/waves-transactions";
import { accountData } from "@waves/waves-transactions/dist/nodeInteraction.js";
import { parseArgs } from "util";
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
    },
    allowPositionals: true,
  });

  await handleTx(
    data(
      {
        data: [
          {
            key: base58Encode(
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
    },
    allowPositionals: true,
  });

  await handleTx(
    data(
      {
        data: [
          {
            key: base58Encode(
              await new SignerClient(positionals[0]).publicKey(),
            ),
          },
        ],
        chainId: chainId,
      },
      oracles.seed,
    ),
    Boolean(values.apply),
  );
}

async function list() {
  const currentData = await accountData({ address: oracles.address }, nodeUrl);
  console.log(
    Object.keys(currentData)
      .filter((x) => currentData[x].value)
      .map((x) => Buffer.from(base58Decode(x)).toString("hex")),
  );
}
