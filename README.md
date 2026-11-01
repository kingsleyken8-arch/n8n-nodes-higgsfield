# n8n-nodes-higgsfield

This is an n8n community node. It lets you generate images and videos with [Higgsfield](https://higgsfield.ai) AI models in your n8n workflows.

Higgsfield is an AI image and video platform. Its API gives access to its own models, such as Soul, and to partner models, such as Kling and Minimax Hailuo. Without this node you need an HTTP Request node, a Wait node and a webhook to use it from n8n. This node does the waiting for you.

This is an unofficial node. It is not made or supported by Higgsfield.

[n8n](https://n8n.io/) is a [fair-code licensed](https://docs.n8n.io/sustainable-use-license/) workflow automation platform.

- [Installation](#installation)
- [Credentials](#credentials)
- [Operations](#operations)
- [Usage](#usage)
- [Errors](#errors)
- [Compatibility](#compatibility)
- [Resources](#resources)
- [Version history](#version-history)

## Installation

Follow the [installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) in the n8n community nodes documentation. The package name is `n8n-nodes-higgsfield`.

## Credentials

You need a Higgsfield API key and a funded API balance. The API is billed separately from a Higgsfield app subscription.

1. Sign in to the Higgsfield Console and add funds to your API balance.
2. Create an API key. Higgsfield shows a key ID and a secret. Copy the secret straight away, because it is shown only once.
3. In n8n, create a **Higgsfield API** credential and paste the key ID and the secret.
4. Leave **Base URL** as `https://api.higgsfield.ai` unless Higgsfield support gives you another address.

When you save the credential, n8n checks the key without starting a generation, so the check costs nothing.

See [Higgsfield authentication](https://docs.higgsfield.ai/docs/authentication) for more detail.

## Operations

**Generation**

| Operation | What it does |
|---|---|
| Generate | Starts an image or video generation. By default it waits until the result is ready and returns the file links. |
| Get Status | Returns the status and result of a generation. It can also wait until the generation finishes. |
| Cancel | Stops a generation that is still waiting in the queue. A generation that has started cannot be stopped. |
| Delete | Deletes a finished generation's files, prompt and settings from Higgsfield. Billing records are kept. |

### Models

The Generate operation lists these models, with fields for their settings:

| Model | Type | Main fields |
|---|---|---|
| Soul Standard | Text to image | Prompt, aspect ratio, number of images (1 to 4), resolution (2K or 4K) |
| Kling 2.5 Turbo Pro | Text to video, image to video | Prompt, image URL, duration (5 or 10 seconds), CFG scale, negative prompt |
| Kling 2.5 Turbo Standard | Image to video | Prompt, image URL, duration (5 or 10 seconds), CFG scale, negative prompt |
| Minimax Hailuo 2.3 Standard | Text to video, image to video | Prompt, image URL, duration (6 or 10 seconds), prompt optimizer |

To use any other model, choose **Custom Model Path**. Copy the model path from the model's page in the Higgsfield Console (for example `higgsfield-ai/soul/v2/standard`) and type the request body as JSON. You can also paste the full address; the node removes `https://api.higgsfield.ai` for you.

**Extra Input (JSON)** under Additional Fields lets you send any field a model accepts that the node does not list, such as a seed.

### Output

Every Generate and Get Status result contains Higgsfield's response, plus an `outputUrls` list with every file link:

```json
{
  "status": "completed",
  "request_id": "3f1c2d9e-8a7b-4c5d-9e0f-1a2b3c4d5e6f",
  "video": { "url": "https://..." },
  "expires_at": "2026-11-08T10:00:00Z",
  "outputUrls": ["https://..."]
}
```

Higgsfield deletes output files seven days after a generation finishes. Turn on **Download Files** in the options to get the files as binary data, then save them to Google Drive, S3 or anywhere else.

## Usage

### Wait inside the node (simplest)

Leave **Wait for Result** on. The node checks the status every 5 seconds and returns when the generation is ready, for up to 15 minutes. You can change both under Options. If the time runs out, the generation keeps running at Higgsfield and the error message gives you the request ID, so you can collect the result later with **Get Status**.

### Wait with a webhook (for long videos)

1. Turn off **Wait for Result**.
2. Under Options, set **Webhook URL** to `{{ $execution.resumeUrl }}`.
3. Add a **Wait** node after this node, set to resume **On Webhook Call** with the POST method.

Higgsfield calls that address when the generation finishes, and the workflow continues from the Wait node with the result.

### Avoid paying twice

If a workflow might send the same generation twice (for example after a retry), set **Idempotency Key** under Options to a value that is unique for that piece of work, such as an order ID. Higgsfield then returns the first generation instead of starting and charging for a new one.

### Example workflow

[examples/text-to-video.json](examples/text-to-video.json) generates a 5 second video from a prompt with Kling 2.5 Turbo Pro and downloads it. Import it into n8n, select your Higgsfield credential, and run it.

### Use with an AI agent

The node can be used as a tool by n8n's AI Agent node, so an agent can create images or videos on request.

## Errors

The node explains Higgsfield's errors in plain language:

| Message | Meaning |
|---|---|
| Higgsfield rejected the API key | The key ID or secret is wrong. |
| Your Higgsfield API balance is too low | Add funds in the Higgsfield Console. |
| Higgsfield did not accept the input | A field is missing or has the wrong value. The message names the field. |
| Higgsfield could not find this model | The model path is wrong. |
| Higgsfield is busy for this account | Your queue is full. The node tries up to three times on its own before showing this. |
| Higgsfield blocked this generation under its content rules | Content moderation flagged the prompt, an input file or the result. Blocked generations are not charged. |
| Higgsfield could not finish this generation | The generation failed. Failed generations are not charged. |

Turn on **Continue On Fail** in the node settings to keep the workflow running. Failed items then carry `error`, `errorDescription` and `request_id`.

## Compatibility

Built with the n8n node tool (`@n8n/node-cli` 0.54) and tested with n8n 2.45.7. The package has no runtime dependencies.

## Resources

- [n8n community nodes documentation](https://docs.n8n.io/integrations/#community-nodes)
- [Higgsfield API documentation](https://docs.higgsfield.ai/docs/index)
- [Higgsfield request lifecycle](https://docs.higgsfield.ai/docs/concepts/requests)
- [Higgsfield webhooks](https://docs.higgsfield.ai/docs/how-to/webhooks)

## Version history

See [CHANGELOG.md](CHANGELOG.md).

## License

[MIT](LICENSE.md)
