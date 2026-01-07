import { setScript, transfer } from "@waves/waves-transactions";
import {
  balance,
  scriptInfo,
} from "@waves/waves-transactions/dist/nodeInteraction.js";
import { parseArgs } from "node:util";
import { chainId, nodeUrl } from "./lib/network.js";
import { handleTx, removePrefix, wvs } from "./lib/utils.js";
import {
  oracles as oraclesWallet,
  quotes as quotesWallet,
  requests as requestsWallet,
  responses as responsesWallet,
  treasury,
  Wallet,
} from "./lib/wallets.js";
import {
  oracles as oraclesScript,
  quotes as quotesScript,
  requests as requestsScript,
  responses as responsesScript,
} from "./scripts.js";

const { values } = parseArgs({
  options: {
    apply: {
      type: "boolean",
    },
  },
});

await fund(oraclesWallet.address, 0.02 * wvs, 0.005 * wvs);
await fund(responsesWallet.address, 0.01 * wvs, 0.0025 * wvs);
await fund(requestsWallet.address, 0.01 * wvs, 0.0025 * wvs);
await fund(quotesWallet.address, 0.01 * wvs, 0.0025 * wvs);

await deployScript(oraclesWallet, oraclesScript);
await deployScript(responsesWallet, responsesScript);
await deployScript(requestsWallet, requestsScript);
await deployScript(quotesWallet, quotesScript);

async function fund(address: string, amount: number, ifLess: number) {
  const oracleBalance = await balance(address, nodeUrl);
  if (oracleBalance < ifLess) {
    await handleTx(
      transfer(
        {
          recipient: address,
          amount: amount,
          chainId: chainId,
        },
        treasury.seed,
      ),
      Boolean(values.apply),
    );
  }
}

async function deployScript(wallet: Wallet, script: string) {
  const info = (await scriptInfo(wallet.address, nodeUrl)) as {
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
        chainId: chainId,
      },
      wallet.seed,
    ),
    Boolean(values.apply),
  );
}
