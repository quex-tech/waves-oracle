import assert from "node:assert/strict";
import test from "node:test";
import {
  HttpRequest,
  UnencryptedHttpPrivatePatch,
} from "../src/lib/models.js";

void test("HttpRequest.fromParts parses URL, headers, and body", () => {
  const req = HttpRequest.fromParts(
    "POST",
    "https://api.example.com/v1/items?foo=bar&baz=qux",
    ["X-Test: 1", "X-Other: two"],
    "body",
  );

  assert.equal(req.method, "POST");
  assert.equal(req.host, "api.example.com");
  assert.equal(req.path, "/v1/items");
  assert.deepStrictEqual(
    req.parameters.map((p) => [p.key, p.value]),
    [
      ["foo", "bar"],
      ["baz", "qux"],
    ],
  );
  assert.deepStrictEqual(
    req.headers.map((h) => [h.key, h.value]),
    [
      ["X-Test", "1"],
      ["X-Other", "two"],
    ],
  );
  assert.equal(req.body, "body");
});

void test("UnencryptedHttpPrivatePatch.fromParts parses suffix parts", () => {
  const patch = UnencryptedHttpPrivatePatch.fromParts(
    "/sec?enc=1&mode=on",
    ["X-Secret: v"],
    "top",
  );

  assert.equal(patch.pathSuffix?.toString("utf8"), "/sec");
  assert.deepStrictEqual(
    patch.parameters.map((p) => [p.key, p.value]),
    [
      ["enc", "1"],
      ["mode", "on"],
    ],
  );
  assert.deepStrictEqual(
    patch.headers.map((h) => [h.key, h.value]),
    [["X-Secret", "v"]],
  );
  assert.equal(patch.body?.toString("utf8"), "top");
});

void test(
  "UnencryptedHttpPrivatePatch.fromParts handles query-only suffix",
  () => {
    const patch = UnencryptedHttpPrivatePatch.fromParts(
      "?token=abc",
      null,
      null,
    );

    assert.equal(patch.pathSuffix, null);
    assert.deepStrictEqual(
      patch.parameters.map((p) => [p.key, p.value]),
      [["token", "abc"]],
    );
    assert.deepStrictEqual(patch.headers, []);
    assert.equal(patch.body, null);
  },
);
