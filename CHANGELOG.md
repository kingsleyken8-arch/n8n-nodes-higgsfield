# Changelog

## 0.1.0

First release.

- Generation resource with Generate, Get Status, Cancel and Delete operations.
- Built-in models: Soul Standard, Kling 2.5 Turbo (Pro and Standard), Minimax Hailuo 2.3 Standard.
- Custom Model Path for any other Higgsfield model, with a JSON body.
- Waits for the result by checking the status, or hands off to a webhook.
- Optional download of the finished files as binary data.
- Idempotency key support, and automatic retries when Higgsfield's queue is full.
- Free credential check that does not start a generation.
