exciting landing page
A supernatural being with extraordinary powers that usually takes a human form and serves its summoner.
what's the fun in that.

- [ ] take photo option is not rendering correctly
- [ ] check and correct image input in llm text mode
- [ ] chat panel expansion from agnet bar takes 2 clicks sometimes

- [ ] tutorial
- [ ] tool display cards
- [ ] handle api rate limits

- [ ] voice assistant hanging without disconnect

## backlog

info card on gallery overlay
do not allow more than one tracking panels doing the same thing at the same time
more flexible manual intervention searching of products and filtering

- [ ] display panels (like order-tracking and product-detail) weren't strictly validated by these contracts yet—they blindly trusted the caller (the agent or the UI) to pass the correct payload. To bulletproof the app going forward, the next architectural step would be to add requiredPayload schemas to panel-contracts.ts so ui.open() immediately rejects or auto-fetches missing data instead of rendering an empty shell.

- [ ] doom loop prevention, max retries for same tool calls
