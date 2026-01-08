import { setScript, transfer } from "@waves/waves-transactions";
import {
  balance,
  scriptInfo,
} from "@waves/waves-transactions/dist/nodeInteraction.js";
import { parseArgs } from "node:util";
import { nodeUrl } from "./lib/network.js";
import { handleTx, removePrefix, wvs } from "./lib/utils.js";
import {
  attestedPools as attestedPoolsWallet,
  privatePools as privatePoolsWallet,
  quotes as quotesWallet,
  requests as requestsWallet,
  responses as responsesWallet,
  treasury,
  Wallet,
} from "./lib/wallets.js";
import {
  attestedPools as attestedPoolsScript,
  privatePools as privatePoolsScript,
  quotes as quotesScript,
  requests as requestsScript,
  responses as responsesScript,
} from "./scripts.js";

const { values } = parseArgs({
  options: {
    chain: {
      type: "string",
      default: "R",
    },
    apply: {
      type: "boolean",
    },
  },
});

await fund(privatePoolsWallet.address(values.chain), 0.01 * wvs, 0.0025 * wvs);
await fund(responsesWallet.address(values.chain), 0.01 * wvs, 0.0025 * wvs);
await fund(requestsWallet.address(values.chain), 0.01 * wvs, 0.0025 * wvs);
await fund(quotesWallet.address(values.chain), 0.01 * wvs, 0.0025 * wvs);
await fund(attestedPoolsWallet.address(values.chain), 0.01 * wvs, 0.0025 * wvs);

await deployScript(privatePoolsWallet, privatePoolsScript);
await deployScript(responsesWallet, responsesScript);
await deployScript(requestsWallet, requestsScript);
await deployScript(quotesWallet, quotesScript);
await deployScript(attestedPoolsWallet, attestedPoolsScript);

async function fund(address: string, amount: number, ifLess: number) {
  const oracleBalance = await balance(address, nodeUrl);
  if (oracleBalance < ifLess) {
    await handleTx(
      transfer(
        {
          recipient: address,
          amount: amount,
          chainId: values.chain,
        },
        treasury.seed,
      ),
      Boolean(values.apply),
    );
  }
}

async function deployScript(wallet: Wallet, script: string) {
  const info = (await scriptInfo(wallet.address(values.chain), nodeUrl)) as {
    script?: string;
  };

  if (
    removePrefix(info.script ?? "", "base64:") ===
    removePrefix(script, "base64:")
  ) {
    return;
  }

  await handleTx(
    setScript(
      {
        script: script,
        chainId: values.chain,
      },
      wallet.seed,
    ),
    Boolean(values.apply),
  );
}
