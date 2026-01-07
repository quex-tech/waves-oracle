import { base58Decode } from "@waves/ts-lib-crypto";
import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { ANY_TD_ADDRESS } from "./lib/models.js";
import { fetchRequests, fulfillRequest } from "./lib/requests.js";
import { SignerClient } from "./lib/signer.js";
import { handleTx, wvs } from "./lib/utils.js";
import { treasury } from "./lib/wallets.js";

const MIN_REWARD = 0.001 * wvs;
const FEE = 0.005 * wvs;

type Config = {
  networks: NetworkConfig[];
};

type NetworkConfig = {
  chainId: string;
  nodeUrls: string[];
  requestsAddress: string;
  responsesAddress: string;
  pools: Record<string, Record<string, PoolConfig>>;
};

type PoolConfig = {
  addresses: Record<string, OracleConfig>;
};

type OracleConfig = {
  urls: string[];
};

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

const rawConfig = await readFile(values.config, "utf8");
const config = (function () {
  try {
    return JSON.parse(rawConfig) as Config;
  } catch (e) {
    throw new Error(`Invalid JSON in config file: ${values.config}`);
  }
})();

for (const network of config.networks) {
  const nodeUrl =
    network.nodeUrls[Math.floor(Math.random() * network.nodeUrls.length)];
  if (!nodeUrl) {
    continue;
  }

  for (const req of await fetchRequests(network.requestsAddress, nodeUrl)) {
    if (req.reward < FEE + MIN_REWARD) {
      continue;
    }

    const now = new Date();
    if (req.after > now || req.before < now) {
      continue;
    }

    const addressPools = network.pools[req.pool.address];
    if (!addressPools) {
      continue;
    }

    const pool = addressPools[req.pool.id.toString("hex")];
    if (!pool) {
      continue;
    }

    const urls =
      req.action.action.patch.tdAddress == ANY_TD_ADDRESS
        ? Object.values(pool.addresses).flatMap((x) => x.urls)
        : pool.addresses[req.action.action.patch.tdAddress].urls;

    const oracleUrl = urls[Math.floor(Math.random() * urls.length)];
    if (!oracleUrl) {
      continue;
    }
    const signerClient = new SignerClient(oracleUrl);

    const res = await signerClient.query(
      req.action,
      base58Decode(treasury.address),
    );

    try {
      await handleTx(
        fulfillRequest(
          res,
          network.responsesAddress,
          req.pool,
          req.txId,
          network.requestsAddress,
          network.chainId,
          treasury.seed,
        ),
        Boolean(values.apply),
      );
    } catch (e) {
      console.log(e);
      continue;
    }
  }
}
