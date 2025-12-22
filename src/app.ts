#!/usr/bin/env node
import { invokeScript } from "@waves/waves-transactions";
import {
  HttpRequest,
  UnencryptedHttpAction,
  UnencryptedHttpPrivatePatch,
} from "./models.js";
import { SignerClient } from "./signer.js";
import { oracles, responses as responsesWallet, treasury } from "./wallets.js";
import { base58Decode } from "@waves/ts-lib-crypto";
import { handleTx } from "./utils.js";
import { chainId } from "./network.js";
import { keygen } from "@noble/secp256k1";

const action = new UnencryptedHttpAction(
  HttpRequest.fromParts(
    "GET",
    "https://api.binance.com/api/v3/ticker/price",
    [],
    ""
  ),
  UnencryptedHttpPrivatePatch.fromParts("?symbol=ADAUSDT", null, null),
  "uint",
  ".price|tonumber*100000000|floor"
);

const signerClient = new SignerClient("http://10.13.192.142:8080/");

const tdPublicKey = await signerClient.publicKey();
const senderPrivKey = keygen().secretKey;

const actionWithProof = action
  .encrypt(tdPublicKey, await signerClient.address(), senderPrivKey)
  .addProof(tdPublicKey, senderPrivKey);

const res = await signerClient.query(
  actionWithProof,
  base58Decode(treasury.address)
);
console.log(res);
await handleTx(
  invokeScript(
    {
      dApp: responsesWallet.address,
      call: {
        function: "publish",
        args: [
          { type: "binary", value: res.toBytes().toString("base64") },
          { type: "string", value: oracles.address },
        ],
      },
      chainId: chainId,
    },
    treasury.seed
  ),
  false
);
