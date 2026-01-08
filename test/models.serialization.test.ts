import assert from "node:assert/strict";
import test from "node:test";
import {
  DataItem,
  HttpAction,
  HttpActionWithProof,
  HttpPrivatePatch,
  HttpRequest,
  QeReport,
  QueryParameter,
  QueryParameterPatch,
  QuoteBody,
  QuoteHeader,
  RequestHeader,
  RequestHeaderPatch,
} from "../src/lib/models.js";

function makeBuf(length: number, start = 0) {
  const buf = Buffer.alloc(length);
  for (let i = 0; i < length; i++) {
    buf[i] = (start + i) & 0xff;
  }
  return buf;
}

void test("HttpAction round-trips via toBytes/fromBytes", () => {
  const request = new HttpRequest(
    "POST",
    "example.com",
    "/api",
    [new RequestHeader("Content-Type", "application/json")],
    [new QueryParameter("q", "1")],
    '{"ok":true}',
  );
  const patch = new HttpPrivatePatch(
    Buffer.from("secret/path", "utf8"),
    [new RequestHeaderPatch("X-Auth", Buffer.from("abc", "utf8"))],
    [new QueryParameterPatch("token", Buffer.from("xyz", "utf8"))],
    Buffer.from("private-body", "utf8"),
    "0x1234",
  );
  const action = new HttpAction(request, patch, "string", ".value");

  const encoded = action.toBytes();
  const decoded = HttpAction.fromBytes(encoded);

  assert.deepStrictEqual(decoded.toBytes(), encoded);
});

void test("HttpActionWithProof round-trips via toBytes/fromBytes", () => {
  const request = new HttpRequest(
    "GET",
    "example.com",
    "/v1/status",
    [],
    [],
    "",
  );
  const patch = new HttpPrivatePatch(
    Buffer.alloc(0),
    [],
    [],
    Buffer.alloc(0),
    "0x0000",
  );
  const action = new HttpAction(request, patch, "int", ".");
  const withProof = new HttpActionWithProof(action, Buffer.from("proof"));

  const encoded = withProof.toBytes();
  const decoded = HttpActionWithProof.fromBytes(encoded);

  assert.deepStrictEqual(decoded.toBytes(), encoded);
});

void test("DataItem round-trips via toBytes/fromBytes", () => {
  const item = new DataItem(1712345678, 0, Buffer.from("deadbeef", "hex"));
  const encoded = item.toBytes();
  const decoded = DataItem.fromBytes(encoded);

  assert.deepStrictEqual(decoded.toBytes(), encoded);
});

void test("QuoteHeader round-trips via toBytes/fromBytes", () => {
  const header = new QuoteHeader(2, 3, 4, makeBuf(16, 1), makeBuf(20, 100));
  const encoded = header.toBytes();
  const decoded = QuoteHeader.fromBytes(encoded);

  assert.deepStrictEqual(decoded.toBytes(), encoded);
});

void test("QuoteBody round-trips via toBytes/fromBytes", () => {
  const body = new QuoteBody(
    makeBuf(16, 1),
    makeBuf(48, 10),
    makeBuf(48, 20),
    makeBuf(8, 30),
    makeBuf(8, 40),
    makeBuf(8, 50),
    makeBuf(48, 60),
    makeBuf(48, 70),
    makeBuf(48, 80),
    makeBuf(48, 90),
    [makeBuf(48, 100), makeBuf(48, 110), makeBuf(48, 120), makeBuf(48, 130)],
    makeBuf(64, 140),
  );
  const encoded = body.toBytes();
  const decoded = QuoteBody.fromBytes(encoded);

  assert.deepStrictEqual(decoded.toBytes(), encoded);
});

void test("QeReport round-trips via toBytes/fromBytes", () => {
  const report = new QeReport(
    makeBuf(16, 1),
    42,
    makeBuf(16, 10),
    makeBuf(32, 20),
    makeBuf(32, 30),
    7,
    8,
    makeBuf(64, 40),
  );
  const encoded = report.toBytes();
  const decoded = QeReport.fromBytes(encoded);

  assert.deepStrictEqual(decoded.toBytes(), encoded);
});
