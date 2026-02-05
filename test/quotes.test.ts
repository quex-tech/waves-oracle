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

type Val = IntVal | BoolVal | TupleVal | ByteVectorVal;

type IntVal = {
  type: "Int";
  value: number;
};

type BoolVal = {
  type: "Boolean";
  value: boolean;
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

  await t.test("readTL", async () => {
    const cases = [
      { expr: "readTL(base16'0203010203', 0)", expected: [3, 2] },
      { expr: "readTL(base16'308180', 0)", expected: [0x80, 3] },
      { expr: "readTL(base16'30820100', 0)", expected: [0x0100, 4] },
    ];

    for (const testCase of cases) {
      const val = await evaluate(testCase.expr, dApps.quotes);
      const [len, off] = assertTuple(val, 2);
      assert.equal(assertInt(len), testCase.expected[0]);
      assert.equal(assertInt(off), testCase.expected[1]);
    }
  });

  await t.test("skipTLV", async () => {
    const cases = [
      { expr: "skipTLV(base16'0203010203ff', 0)", expected: 5 },
      { expr: "skipTLV(base16'308101aa', 0)", expected: 4 },
    ];

    for (const testCase of cases) {
      const val = await evaluate(testCase.expr, dApps.quotes);
      assert.equal(assertInt(val), testCase.expected);
    }
  });

  await t.test("skipIfTag", async () => {
    const cases = [
      { expr: "skipIfTag(base16'020101ff', 0, 2)", expected: 3 },
      { expr: "skipIfTag(base16'020101ff', 0, 3)", expected: 0 },
    ];

    for (const testCase of cases) {
      const val = await evaluate(testCase.expr, dApps.quotes);
      assert.equal(assertInt(val), testCase.expected);
    }
  });

  await t.test("parseExt", async () => {
    const val = await evaluate(
      "parseExt(base16'300c06032a03040101ff0402aabb', 0)",
      dApps.quotes,
    );
    const [oidVal, valueVal] = assertTuple(val, 2);
    assert.deepEqual(
      assertByteVector(oidVal, "oid"),
      Buffer.from([0x2a, 0x03, 0x04]),
    );
    assert.deepEqual(
      assertByteVector(valueVal, "value"),
      Buffer.from([0xaa, 0xbb]),
    );
  });

  await t.test("getExt empty when missing", async () => {
    const val = await evaluate(
      `getExt(base64'${rootCertBase64}', base16'2a864886f84d010d01')`,
      dApps.quotes,
    );
    assert.equal(assertByteVector(val, "ext").length, 0);
  });

  const cases = [
    {
      name: "sgx",
      oid: "2a864886f84d010d01",
      expected: Buffer.from(
        "MIICJjAeBgoqhkiG+E0BDQEBBBA5ZeGpgc82mqmRIXvDDqYGMIIBYwYKKoZIhvhNAQ0BAjCCAVMwEAYLKoZIhvhNAQ0BAgECAQIwEAYLKoZIhvhNAQ0BAgICAQIwEAYLKoZIhvhNAQ0BAgMCAQIwEAYLKoZIhvhNAQ0BAgQCAQIwEAYLKoZIhvhNAQ0BAgUCAQMwEAYLKoZIhvhNAQ0BAgYCAQEwEAYLKoZIhvhNAQ0BAgcCAQAwEAYLKoZIhvhNAQ0BAggCAQUwEAYLKoZIhvhNAQ0BAgkCAQAwEAYLKoZIhvhNAQ0BAgoCAQAwEAYLKoZIhvhNAQ0BAgsCAQAwEAYLKoZIhvhNAQ0BAgwCAQAwEAYLKoZIhvhNAQ0BAg0CAQAwEAYLKoZIhvhNAQ0BAg4CAQAwEAYLKoZIhvhNAQ0BAg8CAQAwEAYLKoZIhvhNAQ0BAhACAQAwEAYLKoZIhvhNAQ0BAhECAQswHwYLKoZIhvhNAQ0BAhIEEAICAgIDAQAFAAAAAAAAAAAwEAYKKoZIhvhNAQ0BAwQCAAAwFAYKKoZIhvhNAQ0BBAQGsMBvAAAAMA8GCiqGSIb4TQENAQUKAQEwHgYKKoZIhvhNAQ0BBgQQ8I4Dv4XHKOCUk0D26kn1DTBEBgoqhkiG+E0BDQEHMDYwEAYLKoZIhvhNAQ0BBwEBAf8wEAYLKoZIhvhNAQ0BBwIBAf8wEAYLKoZIhvhNAQ0BBwMBAf8=",
        "base64",
      ),
    },
    {
      name: "authorityKeyIdentifier",
      oid: "551d23",
      expected: Buffer.from(
        "30168014956F5DCDBD1BE1E94049C9D4F433CE01570BDE54",
        "hex",
      ),
    },
    {
      name: "cRLDistributionPoints",
      oid: "551d1f",
      expected: Buffer.concat([
        Buffer.from("30623060A05EA05C865A", "hex"),
        Buffer.from(
          "https://api.trustedservices.intel.com/sgx/certification/v4/pckcrl?ca=platform&encoding=der",
          "utf-8",
        ),
      ]),
    },
    {
      name: "subjectKeyIdentifier",
      oid: "551d0e",
      expected: Buffer.from(
        "0414E1699B3B1E544C5E36AA8FEED189CC0EAC22DBBD",
        "hex",
      ),
    },
    {
      name: "keyUsage",
      oid: "551d0f",
      expected: Buffer.from("030206C0", "hex"),
    },
    {
      name: "basicConstraints",
      oid: "551d13",
      expected: Buffer.from("3000", "hex"),
    },
  ];

  for (const testCase of cases) {
    await t.test(`getExt returns ${testCase.name} extension`, async () => {
      const val = await evaluate(
        `getExt(base64'${leafCertBase64}', base16'${testCase.oid}')`,
        dApps.quotes,
      );
      assert.deepEqual(assertByteVector(val, testCase.name), testCase.expected);
    });
  }
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
  if (val.value.length === 0) {
    return Buffer.alloc(0);
  }
  return Buffer.from(base58Decode(val.value));
}

function pp(val: Val) {
  return JSON.stringify(val, null, 2);
}

const rootCertBase64 = `
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

const leafCertBase64 = `
MIIE8DCCBJegAwIBAgIVAM1TrKZtvV4XO+6hUYXtILE6CZlQMAoGCCqGSM49BAMC
MHAxIjAgBgNVBAMMGUludGVsIFNHWCBQQ0sgUGxhdGZvcm0gQ0ExGjAYBgNVBAoM
EUludGVsIENvcnBvcmF0aW9uMRQwEgYDVQQHDAtTYW50YSBDbGFyYTELMAkGA1UE
CAwCQ0ExCzAJBgNVBAYTAlVTMB4XDTI2MDExOTA4NTg1OVoXDTMzMDExOTA4NTg1
OVowcDEiMCAGA1UEAwwZSW50ZWwgU0dYIFBDSyBDZXJ0aWZpY2F0ZTEaMBgGA1UE
CgwRSW50ZWwgQ29ycG9yYXRpb24xFDASBgNVBAcMC1NhbnRhIENsYXJhMQswCQYD
VQQIDAJDQTELMAkGA1UEBhMCVVMwWTATBgcqhkjOPQIBBggqhkjOPQMBBwNCAAQp
1T/W8blozRMLVZEdiZXwHIPqhptJGPu8dW+ohZifSHrQiFz8VP829WAFMwbyudWc
QX4B6iOu4yjbYuOEYOjso4IDDDCCAwgwHwYDVR0jBBgwFoAUlW9dzb0b4elAScnU
9DPOAVcL3lQwawYDVR0fBGQwYjBgoF6gXIZaaHR0cHM6Ly9hcGkudHJ1c3RlZHNl
cnZpY2VzLmludGVsLmNvbS9zZ3gvY2VydGlmaWNhdGlvbi92NC9wY2tjcmw/Y2E9
cGxhdGZvcm0mZW5jb2Rpbmc9ZGVyMB0GA1UdDgQWBBThaZs7HlRMXjaqj+7RicwO
rCLbvTAOBgNVHQ8BAf8EBAMCBsAwDAYDVR0TAQH/BAIwADCCAjkGCSqGSIb4TQEN
AQSCAiowggImMB4GCiqGSIb4TQENAQEEEDll4amBzzaaqZEhe8MOpgYwggFjBgoq
hkiG+E0BDQECMIIBUzAQBgsqhkiG+E0BDQECAQIBAjAQBgsqhkiG+E0BDQECAgIB
AjAQBgsqhkiG+E0BDQECAwIBAjAQBgsqhkiG+E0BDQECBAIBAjAQBgsqhkiG+E0B
DQECBQIBAzAQBgsqhkiG+E0BDQECBgIBATAQBgsqhkiG+E0BDQECBwIBADAQBgsq
hkiG+E0BDQECCAIBBTAQBgsqhkiG+E0BDQECCQIBADAQBgsqhkiG+E0BDQECCgIB
ADAQBgsqhkiG+E0BDQECCwIBADAQBgsqhkiG+E0BDQECDAIBADAQBgsqhkiG+E0B
DQECDQIBADAQBgsqhkiG+E0BDQECDgIBADAQBgsqhkiG+E0BDQECDwIBADAQBgsq
hkiG+E0BDQECEAIBADAQBgsqhkiG+E0BDQECEQIBCzAfBgsqhkiG+E0BDQECEgQQ
AgICAgMBAAUAAAAAAAAAADAQBgoqhkiG+E0BDQEDBAIAADAUBgoqhkiG+E0BDQEE
BAawwG8AAAAwDwYKKoZIhvhNAQ0BBQoBATAeBgoqhkiG+E0BDQEGBBDwjgO/hcco
4JSTQPbqSfUNMEQGCiqGSIb4TQENAQcwNjAQBgsqhkiG+E0BDQEHAQEB/zAQBgsq
hkiG+E0BDQEHAgEB/zAQBgsqhkiG+E0BDQEHAwEB/zAKBggqhkjOPQQDAgNHADBE
AiA8FjuSc7Xoktz4wpiNS5cyo+YlqED7XAkYoHtsDAyjMQIgN8Xb1iy/cMh18QNC
+INxKoYIMuWdS309Mk5O+T9ls7s=
`.replace(/\s+/g, "");
