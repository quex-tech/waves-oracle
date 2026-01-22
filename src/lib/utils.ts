import { DataTransactionEntry } from "@waves/ts-types";

export const wvs = 10 ** 8;

export function removePrefix(s: string, p: string): string {
  return s.startsWith(p) ? s.slice(p.length) : s;
}

export function parseBinaryEntry(entry: DataTransactionEntry) {
  if (entry.type !== "binary") {
    throw Error("Invalid binary entry");
  }

  return Buffer.from(removePrefix(entry.value, "base64:"), "base64");
}

export function parseIntegerEntry(entry: DataTransactionEntry) {
  if (entry.type !== "integer") {
    throw Error("Invalid integer entry");
  }

  if (typeof entry.value === "string") {
    throw Error("Integer is too large");
  }

  return entry.value;
}

export function groupFieldsByKey(data: Record<string, DataTransactionEntry>) {
  const res: Record<string, Record<string, DataTransactionEntry>> = {};
  for (const [key, val] of Object.entries(data)) {
    const lastSepIdx = key.lastIndexOf(":");
    const field = key.slice(lastSepIdx + 1);
    (res[key.slice(0, lastSepIdx)] ||= {})[field] = val;
  }
  return res;
}

export function escapeRegExp(string: string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
