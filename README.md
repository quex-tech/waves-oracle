# Quex Waves Oracle

## Setup

Install dependencies:

```sh
npm i
```

Build the TypeScript sources:

```sh
npm run build
```

If you keep secrets in `.env`, you can load them for the current shell with:

```sh
source load_env.sh
```

## Run tests

```sh
npm test
```

Some tests require running private node on localhost:6869.

## Environment Variables

- `SEED`: root wallet seed used to sign transactions.

Example `.env`:

```sh
SEED="your seed phrase here"
```

## Config file

All CLI tools use a JSON config describing networks, dApps, and oracle pools.
See `config.json` for a working example.

Minimal structure:

```json
{
  "networks": {
    "R": {
      "nodeUrls": ["http://localhost:6869/"],
      "dApps": {
        "attestedPools": "<address>",
        "privatePools": "<address>",
        "quotes": "<address>",
        "requests": "<address>",
        "responses": "<address>"
      },
      "pools": {
        "<pool-address>": {
          "<pool-id-hex>": {
            "addresses": {
              "<td-address>": {
                "urls": ["http://oracle:8080/"]
              }
            }
          }
        }
      }
    }
  }
}
```

## Quex Request Oracle

You will need access to a Quex Request Oracle via HTTPS.

Source code for the oracle is here: https://github.com/quex-tech/quex-v1-signer/

## Usage

All commands accept `-h/--help` for details. Omit `--apply` to preview a
transaction without submitting.

### Deploy Ride scripts

```sh
node dist/deploy.js --config ./config.json --chain R --src-path ./src/ride --apply
```

`--config ./config.json --chain R` are the defaults, so you can omit them.

This command derives some wallets from the root SEED, funds them from the root wallet, and sets up scripts there.

Example output:
```
{
  "R": {
    "dApps": {
      "attestedPools": "3MGqWUDyZuENhGUK7MqcavBbgtTgfMeDzUW",
      "privatePools": "3MJfAPuSQgQSB1AcUHHFzRUjMpx7j35YsQv",
      "quotes": "3M3hcSBqTF5SJxespKA13S6y6nFS9zA2eJX",
      "requests": "3M9KRgzrYgRNP6Ddg6V5mT1otM6fmURGN1T",
      "responses": "3MG4iWUwv79zHPbuAoMs3rRUM4cb8LnhxuT"
    }
  }
}
```

You can add these addresses to your `config.json`.

### Manage private pools

The oracles are organized in Oracle Pools by the set of actions they can perform.

A private pool is a pool with an owner who can arbitrarily add and remove any oracles.

You can use these commands for this:

```sh
node dist/privatePools.js add <oracle-url> --apply
node dist/privatePools.js delete <oracle-url> --apply
node dist/privatePools.js list
```

On Waves blockchain a pool is identified by two things: the address of a dApp with a `isInPool(pk: ByteVector, poolId: ByteVector)` method, and the Pool ID (0 to 64 bytes).

In case of private pools, the address is fixed, and Pool ID is the owner address.

### Register and list TD quotes. Manage attested pools

There are also attested pools. Such a pool is defined by another fixed address and Pool ID is `quotesAddress || sha256(TD quote without Report Data)`.

All oracles in an attested pools are guaranteed to have the same Intel TDX measurements.

First, register a TD quote on-chain.

```sh
node dist/quotes.js register <oracle-url> --apply
node dist/quotes.js list
```

Then, add the oracle to the attested pool.

```sh
node dist/attestedPools.js add <oracle-url> --apply
node dist/attestedPools.js list
```

### Publish an oracle response

Make a request to the oracle and publish the response on-chain:

```sh
node --experimental-global-webcrypto dist/publish.js \
  -X POST \
  -H "Content-Type: application/json" \
  --enc-header "Authorization: Bearer $CHAT_GPT_API_KEY" \
  -d '{"model":"gpt-5-nano","input":"What is the capital of France? Answer in one word."}' \
  -f '.output|map(.content//[])|add|map(.text//\"\")|add' \
  --output-request "chatgpt.txt" \
  "https://api.openai.com/v1/responses" \
  "string" \
  --apply
```

Use `--experimental-global-webcrypto` on Node versions that do not expose WebCrypto by default (Node 20+ does not need it).

Replay a stored request and publish the new response on-chain (it replaces the previous one):

```sh
node --experimental-global-webcrypto dist/publish.js --from-file chatgpt.txt --apply
```

### View responses

```sh
node dist/responses.js
```

### Manage requests

You can add an on-chain request for the oracle with a reward.

Add a request:

```sh
node --experimental-global-webcrypto dist/requests.js add \
  --oracle-url http://localhost:8080 \
  --pool-addr <pool-address> \
  --pool-id <pool-id> \
  "https://api.binance.com/api/v3/depth?symbol=BTCUSDT&limit=1" \
  "(uint,(uint,uint)[])" \
  --apply
```

List pending requests:

```sh
node dist/requests.js list
```

If `--pool-addr` and `--pool-id` are omitted, a private pool owned by the root wallet is used.

Recycle an expired request and get the reward back:

```sh
node dist/requests.js recycle <key> --apply
```

Fulfill a request by making a request to the oracle and publishing the response:

```sh
node dist/requests.js fulfill <key> --apply
```

### Relayer

Automatically fulfill eligible requests:

```sh
node dist/relayer.js --apply
```
