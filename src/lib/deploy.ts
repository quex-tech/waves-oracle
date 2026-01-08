import type { SignedTransaction, Transaction, WithId } from "@waves/ts-types";
import { setScript, transfer } from "@waves/waves-transactions";
import {
  balance,
  scriptInfo,
} from "@waves/waves-transactions/dist/nodeInteraction.js";
import fs from "fs";
import { join } from "node:path";
import { removePrefix, wvs } from "./utils.js";
import { IWallet, wallet } from "./wallets.js";

export type DApps = {
  attestedPools: string;
  privatePools: string;
  quotes: string;
  requests: string;
  responses: string;
};

export type DeployResult = {
  dApps: DApps;
  txs: Array<SignedTransaction<Transaction> & WithId>;
};

export async function deployDApps(
  chainId: string,
  nodeUrl: string,
  srcDirPath: string,
): Promise<DeployResult> {
  const scripts = {
    attestedPools: await compileRide(
      join(srcDirPath, "attested-pools.ride"),
      nodeUrl,
    ),
    privatePools: await compileRide(
      join(srcDirPath, "private-pools.ride"),
      nodeUrl,
    ),
    quotes: await compileRide(join(srcDirPath, "quotes.ride"), nodeUrl),
    requests: await compileRide(join(srcDirPath, "requests.ride"), nodeUrl),
    responses: await compileRide(join(srcDirPath, "responses.ride"), nodeUrl),
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

  const txs: Array<SignedTransaction<Transaction> & WithId> = [];
  const amount = 0.01 * wvs;
  const ifLess = 0.0025 * wvs;
  const fundTxs = await Promise.all([
    fund(dApps.attestedPools, amount, ifLess, nodeUrl, chainId),
    fund(dApps.privatePools, amount, ifLess, nodeUrl, chainId),
    fund(dApps.quotes, amount, ifLess, nodeUrl, chainId),
    fund(dApps.requests, amount, ifLess, nodeUrl, chainId),
    fund(dApps.responses, amount, ifLess, nodeUrl, chainId),
  ]);

  for (const tx of fundTxs) {
    if (tx) {
      txs.push(tx);
    }
  }

  const deployTxs = await Promise.all([
    deployScript(
      wallets.attestedPools,
      scripts.attestedPools,
      nodeUrl,
      chainId,
    ),
    deployScript(wallets.privatePools, scripts.privatePools, nodeUrl, chainId),
    deployScript(wallets.quotes, scripts.quotes, nodeUrl, chainId),
    deployScript(wallets.requests, scripts.requests, nodeUrl, chainId),
    deployScript(wallets.responses, scripts.responses, nodeUrl, chainId),
  ]);

  for (const tx of deployTxs) {
    if (tx) {
      txs.push(tx);
    }
  }

  return { dApps, txs };
}

async function fund(
  address: string,
  amount: number,
  ifLess: number,
  nodeUrl: string,
  chainId: string,
): Promise<(SignedTransaction<Transaction> & WithId) | null> {
  const oracleBalance = await balance(address, nodeUrl);
  if (oracleBalance < ifLess) {
    return transfer(
      {
        recipient: address,
        amount: amount,
        chainId: chainId,
      },
      wallet.seed,
    );
  }
  return null;
}

async function deployScript(
  wallet: IWallet,
  script: string,
  nodeUrl: string,
  chainId: string,
): Promise<(SignedTransaction<Transaction> & WithId) | null> {
  const info = (await scriptInfo(wallet.address(chainId), nodeUrl)) as {
    script?: string;
  };

  if (
    removePrefix(info.script ?? "", "base64:") ===
    removePrefix(script, "base64:")
  ) {
    return null;
  }

  return setScript(
    {
      script: script,
      chainId: chainId,
    },
    wallet.seed,
  );
}

type CompilationResult = {
  script: string;
  complexity: number;
  verifierComplexity: number;
  callableComplexities: Record<string, number>;
  extraFee: number;
};

async function compileRide(path: string, nodeUrl: string): Promise<string> {
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
