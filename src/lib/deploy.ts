import type { SignedTransaction, Transaction, WithId } from "@waves/ts-types";
import { setScript, transfer } from "@waves/waves-transactions";
import {
  balance,
  scriptInfo,
} from "@waves/waves-transactions/dist/nodeInteraction.js";
import fs from "fs";
import { join } from "node:path";
import { removePrefix } from "./utils.js";
import { RootWallet } from "./wallets.js";

export type DApps = {
  attestedPools: string;
  attestedWhitelistPools: string;
  privatePools: string;
  quotes: string;
  requests: string;
  responses: string;
};

export type DeployResult = {
  dApps: DApps;
  txs: Array<SignedTransaction<Transaction> & WithId>;
};

export function getDApps(wallet: RootWallet, chainId: string) {
  const wallets = getWallets(wallet);

  return {
    attestedPools: wallets.attestedPools.address(chainId),
    attestedWhitelistPools: wallets.attestedWhitelistPools.address(chainId),
    privatePools: wallets.privatePools.address(chainId),
    quotes: wallets.quotes.address(chainId),
    requests: wallets.requests.address(chainId),
    responses: wallets.responses.address(chainId),
  };
}

export async function* deployDApps(
  wallet: RootWallet,
  chainId: string,
  nodeUrl: string,
  srcDirPath: string,
): AsyncGenerator<SignedTransaction<Transaction> & WithId> {
  const scripts = {
    attestedPools: await compileRide(
      join(srcDirPath, "attested-pools.ride"),
      nodeUrl,
    ),
    attestedWhitelistPools: await compileRide(
      join(srcDirPath, "attested-whitelist-pools.ride"),
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

  const wallets = getWallets(wallet);
  const dApps = getDApps(wallet, chainId);

  for (const key of Object.keys(scripts) as Array<keyof typeof scripts>) {
    const info = (await scriptInfo(wallets[key].address(chainId), nodeUrl)) as {
      script?: string;
    };

    if (
      removePrefix(info.script ?? "", "base64:") ===
      removePrefix(scripts[key], "base64:")
    ) {
      continue;
    }

    const setScriptTx = setScript(
      {
        script: scripts[key],
        chainId: chainId,
      },
      wallets[key].seed,
    );

    const accountBalance = await balance(dApps[key], nodeUrl);
    if (accountBalance < Number(setScriptTx.fee)) {
      yield transfer(
        {
          recipient: dApps[key],
          amount: setScriptTx.fee,
          chainId: chainId,
        },
        wallet.seed,
      );
    }

    yield setScriptTx;
  }
}

function getWallets(wallet: RootWallet) {
  return {
    attestedPools: wallet.derive(1),
    attestedWhitelistPools: wallet.derive(6),
    privatePools: wallet.derive(2),
    quotes: wallet.derive(3),
    requests: wallet.derive(4),
    responses: wallet.derive(5),
  };
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
