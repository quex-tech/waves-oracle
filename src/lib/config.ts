import { readFile } from "node:fs/promises";
import { ANY_TD_ADDRESS, FullPoolId } from "./models.js";

export class Config {
  constructor(public readonly networks: Record<string, JsonNetworkConfig>) {}

  static async fromFile(path: string) {
    const rawConfig = await readFile(path, "utf8");
    const config = (function () {
      try {
        return JSON.parse(rawConfig) as {
          networks: Record<string, JsonNetworkConfig>;
        };
      } catch (e) {
        throw new Error(`Invalid JSON in config file: ${path}`);
      }
    })();
    return new Config(config.networks);
  }

  forChain(chainId: string) {
    const config = this.networks[chainId];
    if (!config) {
      throw new Error(
        `Invalid chainId: ${chainId}. Known chainIds: ${Object.keys(this.networks).join(", ")}`,
      );
    }
    return new NetworkConfig(
      chainId,
      config.nodeUrls,
      config.dApps,
      config.pools,
    );
  }
}

export class NetworkConfig {
  constructor(
    public readonly chainId: string,
    public readonly nodeUrls: string[],
    public readonly dApps: JsonDApps,
    public readonly pools: Record<string, Record<string, JsonPoolConfig>>,
  ) {}

  static async fromArgs(config: string, chainId: string) {
    return (await Config.fromFile(config)).forChain(chainId);
  }

  getNodeUrl() {
    const nodeUrl = this.findNodeUrl();
    if (!nodeUrl) {
      throw new Error(`No node URLS defined for chainId: ${this.chainId}`);
    }
    return nodeUrl;
  }

  findNodeUrl() {
    return (
      this.nodeUrls[Math.floor(Math.random() * this.nodeUrls.length)] ?? null
    );
  }

  forPool(pool: FullPoolId): PoolConfig {
    const addressPools = this.pools[pool.address];
    if (!addressPools) {
      return new PoolConfig({});
    }

    const config = addressPools[pool.id.toString("hex")];
    return new PoolConfig((config ?? { addresses: {} }).addresses);
  }

  findDAppName(address: string) {
    const entry = Object.entries(this.dApps).find((x) => x[1] == address);
    return entry ? entry[0] : null;
  }
}

class PoolConfig {
  constructor(public readonly addresses: Record<string, OracleConfig>) {}

  findOracleUrl(tdAddress: string): string | null {
    const urls =
      tdAddress == ANY_TD_ADDRESS
        ? Object.values(this.addresses).flatMap((x) => x.urls)
        : (this.addresses[tdAddress] || { urls: [] }).urls;

    return urls[Math.floor(Math.random() * urls.length)] ?? null;
  }
}

type JsonNetworkConfig = {
  nodeUrls: string[];
  dApps: JsonDApps;
  pools: Record<string, Record<string, JsonPoolConfig>>;
};

type JsonDApps = {
  attestedPools: string;
  attestedWhitelistPools: string;
  privatePools: string;
  quotes: string;
  requests: string;
  responses: string;
};

type JsonPoolConfig = {
  addresses: Record<string, OracleConfig>;
};

type OracleConfig = {
  urls: string[];
};
