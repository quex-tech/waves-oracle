import { base58Decode } from "@waves/ts-lib-crypto";
import { parseArgs } from "node:util";
import { handleTx } from "./cliUtils.js";
import { Config } from "./lib/config.js";
import { fetchRequests, fulfillRequest } from "./lib/requests.js";
import { SignerClient } from "./lib/signer.js";
import { wvs } from "./lib/utils.js";
import { RootWallet } from "./lib/wallets.js";

const MIN_REWARD = 0.001 * wvs;
const FEE = 0.005 * wvs;

const { values } = parseArgs({
  options: {
    config: {
      type: "string",
      default: "./config.json",
    },
    apply: {
      type: "boolean",
    },
    help: {
      type: "boolean",
      short: "h",
    },
  },
});

function printHelp() {
  console.log(
    `Usage: ${process.argv[0]} ${process.argv[1]} [options]
     --config <path>     Path to config.json with oracles. Default: ./config.json
     --apply             Actually submit the transactions
 -h, --help              Show this help message and exit`,
  );
}

if (values.help) {
  printHelp();
  process.exit(0);
}

const config = await Config.fromFile(values.config);

for (const chainId of Object.keys(config.networks)) {
  const network = config.forChain(chainId);
  const nodeUrl = network.findNodeUrl();
  if (!nodeUrl) {
    continue;
  }

  for (const req of await fetchRequests(network.dApps.requests, nodeUrl)) {
    if (req.reward < FEE + MIN_REWARD) {
      continue;
    }

    const now = new Date();
    if (req.after > now || req.before < now) {
      continue;
    }

    const pool = network.forPool(req.pool);
    const oracleUrl = pool.findOracleUrl(req.action.action.patch.tdAddress);
    if (!oracleUrl) {
      continue;
    }

    const signerClient = new SignerClient(oracleUrl);

    const wallet = RootWallet.fromEnv();

    const res = await signerClient.query(
      req.action,
      base58Decode(wallet.address(chainId)),
    );

    try {
      await handleTx(
        fulfillRequest(
          res,
          network.dApps.responses,
          req.pool,
          req.txId,
          network.dApps.requests,
          chainId,
          wallet,
        ),
        Boolean(values.apply),
        nodeUrl,
      );
    } catch (e) {
      console.log(e);
      continue;
    }
  }
}
