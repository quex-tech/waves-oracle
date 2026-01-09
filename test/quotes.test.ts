import { base58Decode } from "@waves/ts-lib-crypto";
import { broadcast, waitForTx } from "@waves/waves-transactions";
import assert from "node:assert/strict";
import test from "node:test";
import { deployDApps, getDApps } from "../src/lib/deploy.js";
import { RootWallet } from "../src/lib/wallets.js";

const chainId = "R";
const nodeUrl = "http://localhost:6869/";
const srcDirPath = `${process.cwd()}/src/ride`;
const wallet = new RootWallet("waves private node seed with waves tokens");

type Val = IntVal | TupleVal | ByteVectorVal;

type IntVal = {
  type: "Int";
  value: number;
};

type TupleVal = {
  type: "Tuple";
  value: Record<string, Val>;
};

type ByteVectorVal = {
  type: "ByteVector";
  value: string;
};

type EvaluateResult = {
  result: Val;
};

void test("quotes.ride helpers", { timeout: 15_000 }, async (t) => {
  for await (const tx of deployDApps(wallet, chainId, nodeUrl, srcDirPath)) {
    await broadcast(tx, nodeUrl);
    await waitForTx(tx.id, { apiBase: nodeUrl });
  }
  const dApps = getDApps(wallet, chainId);

  await t.test("readTime", async () => {
    const val = await evaluate(
      `readTime(base16'170d${Buffer.from("250108174122Z").toString("hex")}', 0)`,
      dApps.quotes,
    );
    const vals = assertTuple(val, 2);
    assert.equal(assertInt(vals[0]), Date.UTC(2025, 0, 8, 17, 41, 22));
    assert.equal(assertInt(vals[1]), 15);
  });

  await t.test("readUInt", async () => {
    const cases = [
      { expr: "readUInt(base16'01020304', 0, 1)", expected: 0x01 },
      { expr: "readUInt(base16'01020304', 1, 2)", expected: 0x0203 },
      { expr: "readUInt(base16'000102', 0, 2)", expected: 0x0001 },
      { expr: "readUInt(base16'ff', 0, 1)", expected: 0xff },
      { expr: "readUInt(base16'8001', 0, 2)", expected: 0x8001 },
    ];

    for (const testCase of cases) {
      const val = await evaluate(testCase.expr, dApps.quotes);
      assert.equal(assertInt(val), testCase.expected);
    }
  });

  await t.test("readCert", async () => {
    const val = await evaluate(`readCert(base64'${certBase64}')`, dApps.quotes);
    const vals = assertTuple(val, 5);

    const tbs = assertByteVector(vals[0], "tbs");
    const x = assertByteVector(vals[1], "x");
    const y = assertByteVector(vals[2], "y");
    const r = assertByteVector(vals[3], "r");
    const s = assertByteVector(vals[4], "s");

    assert.ok(tbs.length > 0, "tbs should not be empty");
    assert.deepStrictEqual(
      x,
      Buffer.from(
        "0BA9C4C0C0C86193A3FE23D6B02CDA10A8BBD4E88E48B4458561A36E705525F5",
        "hex",
      ),
      "wrong x",
    );
    assert.deepStrictEqual(
      y,
      Buffer.from(
        "67918E2EDC88E40D860BD0CC4EE26AACC988E505A953558C453F6B0904AE7394",
        "hex",
      ),
      "wrong y",
    );
    assert.equal(r.length, 32, "r should be 32 bytes");
    assert.equal(s.length, 32, "s should be 32 bytes");
  });
});

async function evaluate(expr: string, dApp: string) {
  const res = await fetch(new URL(`/utils/script/evaluate/${dApp}`, nodeUrl), {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ expr: expr }),
  });
  assert.ok(res.ok, `evaluate failed: ${res.status} ${res.statusText}`);
  return ((await res.json()) as EvaluateResult).result;
}

function assertTuple(val: Val, len: number) {
  assert.equal(val.type, "Tuple", `unexpected tuple value: ${pp(val)}`);
  const keys = Array.from({ length: len }, (_, i) => `_${i + 1}`);
  for (const key of keys) {
    assert.ok(key in val.value, `missing tuple element ${key}: ${pp(val)}`);
  }
  return keys.map((k) => val.value[k]);
}

function assertInt(val: Val) {
  assert.equal(val.type, "Int", `unexpected int value: ${pp(val)}`);
  return val.value;
}

function assertByteVector(val: Val, label: string) {
  assert.equal(val.type, "ByteVector", `unexpected ${label} value: ${pp(val)}`);
  return Buffer.from(base58Decode(val.value));
}

function pp(val: Val) {
  return JSON.stringify(val, null, 2);
}

const certBase64 = `
MIICjzCCAjSgAwIBAgIUImUM1lqdNInzg7SVUr9QGzknBqwwCgYIKoZIzj0EAwIw
aDEaMBgGA1UEAwwRSW50ZWwgU0dYIFJvb3QgQ0ExGjAYBgNVBAoMEUludGVsIENv
cnBvcmF0aW9uMRQwEgYDVQQHDAtTYW50YSBDbGFyYTELMAkGA1UECAwCQ0ExCzAJ
BgNVBAYTAlVTMB4XDTE4MDUyMTEwNDUxMFoXDTQ5MTIzMTIzNTk1OVowaDEaMBgG
A1UEAwwRSW50ZWwgU0dYIFJvb3QgQ0ExGjAYBgNVBAoMEUludGVsIENvcnBvcmF0
aW9uMRQwEgYDVQQHDAtTYW50YSBDbGFyYTELMAkGA1UECAwCQ0ExCzAJBgNVBAYT
AlVTMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEC6nEwMDIYZOj/iPWsCzaEKi7
1OiOSLRFhWGjbnBVJfVnkY4u3IjkDYYL0MxO4mqsyYjlBalTVYxFP2sJBK5zlKOB
uzCBuDAfBgNVHSMEGDAWgBQiZQzWWp00ifODtJVSv1AbOScGrDBSBgNVHR8ESzBJ
MEegRaBDhkFodHRwczovL2NlcnRpZmljYXRlcy50cnVzdGVkc2VydmljZXMuaW50
ZWwuY29tL0ludGVsU0dYUm9vdENBLmRlcjAdBgNVHQ4EFgQUImUM1lqdNInzg7SV
Ur9QGzknBqwwDgYDVR0PAQH/BAQDAgEGMBIGA1UdEwEB/wQIMAYBAf8CAQEwCgYI
KoZIzj0EAwIDSQAwRgIhAOW/5QkR+S9CiSDcNoowLuPRLsWGf/Yi7GSX94BgwTwg
AiEA4J0lrHoMs+Xo5o/sX6O9QWxHRAvZUGOdRQ7cvqRXaqI=
`.replace(/\s+/g, "");
