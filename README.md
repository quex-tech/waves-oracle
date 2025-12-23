# Quex Waves Oracle

## Building

```
npm i
npm run build
```

## Using

To make a request and publish the response on-chain:

```
node --experimental-global-webcrypto dist/publish.js -X POST -H "Content-Type: application/json" --enc-header "Authorization: Bearer $CHAT_GPT_API_KEY" -d '{"model":"gpt-5-nano","input":"What is the capital of France? Answer in one word."}' -f '.output|map(.content//[])|add|map(.text//"")|add' --output-request "chatgpt.txt" "https://api.openai.com/v1/responses" "string" --apply
```

To replay the same request and update the response on-chain:

```
node --experimental-global-webcrypto dist/publish.js --from-file chatgpt.txt --apply
```
