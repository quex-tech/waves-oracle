import { getEnvVar } from "./utils.js";

export const chainId = getEnvVar("CHAIN_ID");
export const nodeUrl = getEnvVar("API_BASE");
