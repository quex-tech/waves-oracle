import {
  treasury,
  oracles as oraclesWallet,
  responses as responsesWallet,
} from "./wallets.js";
import {
  oracles as oraclesScript,
  responses as responsesScript,
} from "./scripts.js";
import { transfer, setScript } from "@waves/waves-transactions";
import { chainId } from "./network.js";
import { parseArgs } from "node:util";
import { handleTx } from "./utils.js";

const { values } = parseArgs({
  options: {
    apply: {
      type: "boolean",
    },
  },
});

await handleTx(
  transfer(
    {
      recipient: oraclesWallet.address,
      amount: setScript(
        {
          script: oraclesScript,
          chainId: chainId,
        },
        oraclesWallet.seed
      ).fee,
      chainId: chainId,
    },
    treasury.seed
  ),
  Boolean(values.apply)
);

await handleTx(
  setScript(
    {
      script: oraclesScript,
      chainId: chainId,
    },
    oraclesWallet.seed
  ),
  Boolean(values.apply)
);

await handleTx(
  transfer(
    {
      recipient: responsesWallet.address,
      amount: setScript(
        {
          script: responsesScript,
          chainId: chainId,
        },
        responsesWallet.seed
      ).fee,
      chainId: chainId,
    },
    treasury.seed
  ),
  Boolean(values.apply)
);

await handleTx(
  setScript(
    {
      script: responsesScript,
      chainId: chainId,
    },
    responsesWallet.seed
  ),
  Boolean(values.apply)
);
