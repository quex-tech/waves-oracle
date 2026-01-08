import { setScript, transfer } from "@waves/waves-transactions";
import {
  balance,
  scriptInfo,
} from "@waves/waves-transactions/dist/nodeInteraction.js";
import fs from "fs";
import { parseArgs } from "node:util";
import { NetworkConfig } from "./lib/config.js";
import { handleTx, removePrefix, wvs } from "./lib/utils.js";
import { IWallet, wallet } from "./lib/wallets.js";

const { values } = parseArgs({
  options: {
    chain: {
      type: "string",
      default: "R",
    },
    config: {
      type: "string",
      default: "./config.json",
    },
    apply: {
      type: "boolean",
    },
  },
});

const network = await NetworkConfig.fromArgs(values.config, values.chain);
const chainId = network.chainId;
const nodeUrl = network.getNodeUrl();

const scripts = {
  attestedPools: await compileRide("./src/ride/attested-pools.ride"),
  privatePools: await compileRide("./src/ride/private-pools.ride"),
  quotes: await compileRide("./src/ride/quotes.ride"),
  requests: await compileRide("./src/ride/requests.ride"),
  responses: await compileRide("./src/ride/responses.ride"),
};

const wallets = {
  attestedPools: wallet.derive(1),
  privatePools: wallet.derive(2),
  quotes: wallet.derive(3),
  requests: wallet.derive(4),
  responses: wallet.derive(5),
};

const dApps = {
  attestedPools: wallets.attestedPools.address(chainId),
  privatePools: wallets.privatePools.address(chainId),
  quotes: wallets.quotes.address(chainId),
  requests: wallets.requests.address(chainId),
  responses: wallets.responses.address(chainId),
};

await fund(dApps.attestedPools, 0.01 * wvs, 0.0025 * wvs);
await fund(dApps.privatePools, 0.01 * wvs, 0.0025 * wvs);
await fund(dApps.quotes, 0.01 * wvs, 0.0025 * wvs);
await fund(dApps.requests, 0.01 * wvs, 0.0025 * wvs);
await fund(dApps.responses, 0.01 * wvs, 0.0025 * wvs);

await deployScript(wallets.attestedPools, scripts.attestedPools);
await deployScript(wallets.privatePools, scripts.privatePools);
await deployScript(wallets.quotes, scripts.quotes);
await deployScript(wallets.requests, scripts.requests);
await deployScript(wallets.responses, scripts.responses);

console.log(
  JSON.stringify(
    {
      [chainId]: {
        dApps: dApps,
      },
    },
    undefined,
    "  ",
  ),
);

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
        wallet.seed,
      ),
      Boolean(values.apply),
      nodeUrl,
    );
  }
}

async function deployScript(wallet: IWallet, script: string) {
  const info = (await scriptInfo(wallet.address(chainId), nodeUrl)) as {
    script?: string;
  };

  if (
    removePrefix(info.script ?? "", "base64:") ===
    removePrefix(script, "base64:")
  ) {
    return;
  }

  console.log(removePrefix(info.script ?? "", "base64:"));
  console.log(removePrefix(script, "base64:"));

  await handleTx(
    setScript(
      {
        script: script,
        chainId: chainId,
      },
      wallet.seed,
    ),
    Boolean(values.apply),
    nodeUrl,
  );
}

type CompilationResult = {
  script: string;
  complexity: number;
  verifierComplexity: number;
  callableComplexities: Record<string, number>;
  extraFee: number;
};

async function compileRide(path: string): Promise<string> {
  const script = fs.readFileSync(path, "utf-8");
  const res = await fetch(
    new URL("/utils/script/compileCode?compact=true", nodeUrl),
    {
      method: "POST",
      headers: { "Content-Type": "text/plain", Accept: "application/json" },
      body: script,
    },
  );
  if (!res.ok) {
    throw new Error(
      `Failed to compile script: ${res.status} ${res.statusText}`,
    );
  }
  const compilation = (await res.json()) as CompilationResult;
  return compilation.script;
}
