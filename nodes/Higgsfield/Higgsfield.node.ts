import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import {
	HAILUO_MODELS,
	IMAGE_INPUT_MODELS,
	KLING_MODELS,
	SOUL_MODELS,
	generationFields,
	generationOperations,
} from './GenerationDescription';
import {
	apiError,
	assertCompleted,
	collectOutputUrls,
	downloadOutputs,
	getStatus,
	higgsfieldRequest,
	submitGeneration,
	TERMINAL_STATUSES,
	waitForResult,
} from './GenericFunctions';

/**
 * Programmatic style, because one Generate run needs several dependent calls:
 * submit the job, check its status until it finishes, then optionally download the files.
 * The declarative style sends one request per item and cannot wait or repeat.
 */
export class Higgsfield implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Higgsfield',
		name: 'higgsfield',
		icon: { light: 'file:higgsfield.svg', dark: 'file:higgsfield.dark.svg' },
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Generate images and videos with Higgsfield AI models',
		defaults: {
			name: 'Higgsfield',
		},
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'higgsfieldApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [{ name: 'Generation', value: 'generation' }],
				default: 'generation',
			},
			...generationOperations,
			...generationFields,
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			let requestId = '';
			try {
				const operation = this.getNodeParameter('operation', i) as string;

				if (operation === 'cancel') {
					requestId = cleanRequestId.call(this, this.getNodeParameter('requestId', i) as string, i);
					const response = await higgsfieldRequest.call(
						this,
						'POST',
						`/requests/${encodeURIComponent(requestId)}/cancel`,
						i,
					);
					if (response.statusCode < 200 || response.statusCode >= 300) {
						throw apiError.call(this, response, 'cancel', i);
					}
					returnData.push({ json: { request_id: requestId, status: 'canceled' }, pairedItem: { item: i } });
					continue;
				}

				if (operation === 'delete') {
					requestId = cleanRequestId.call(this, this.getNodeParameter('requestId', i) as string, i);
					const response = await higgsfieldRequest.call(
						this,
						'DELETE',
						`/requests/${encodeURIComponent(requestId)}`,
						i,
					);
					if (response.statusCode < 200 || response.statusCode >= 300) {
						throw apiError.call(this, response, 'delete', i);
					}
					const body =
						response.body && typeof response.body === 'object'
							? (response.body as IDataObject)
							: { request_id: requestId, status: 'deleted' };
					returnData.push({ json: body, pairedItem: { item: i } });
					continue;
				}

				const options = this.getNodeParameter('options', i, {}) as IDataObject;
				const shouldWait = this.getNodeParameter('waitForResult', i, operation === 'generate') as boolean;
				const pollIntervalSeconds = Number(options.pollIntervalSeconds ?? 5);
				const maxWaitMinutes = Number(options.maxWaitMinutes ?? 15);
				let result: IDataObject;

				if (operation === 'generate') {
					const { path, body } = buildRequest.call(this, i);
					let finalPath = path;
					const webhookUrl = String(options.webhookUrl ?? '').trim();
					if (webhookUrl) {
						finalPath += `${finalPath.includes('?') ? '&' : '?'}hf_webhook=${encodeURIComponent(webhookUrl)}`;
					}
					const headers: IDataObject = {};
					const idempotencyKey = String(options.idempotencyKey ?? '').trim();
					if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;

					result = await submitGeneration.call(this, finalPath, body, i, headers);
					requestId = String(result.request_id);
				} else if (operation === 'get') {
					requestId = cleanRequestId.call(this, this.getNodeParameter('requestId', i) as string, i);
					result = await getStatus.call(this, requestId, i);
				} else {
					throw new NodeOperationError(this.getNode(), `The operation "${operation}" is not supported`, {
						itemIndex: i,
					});
				}

				if (shouldWait) {
					if (!TERMINAL_STATUSES.includes(String(result.status))) {
						result = await waitForResult.call(this, requestId, i, pollIntervalSeconds, maxWaitMinutes);
					}
					assertCompleted.call(this, result, i);
				}

				const outputUrls = collectOutputUrls(result);
				const item: INodeExecutionData = {
					json: { ...result, outputUrls },
					pairedItem: { item: i },
				};
				if (options.downloadFiles === true && result.status === 'completed' && outputUrls.length) {
					item.binary = await downloadOutputs.call(this, outputUrls, i);
				}
				returnData.push(item);
			} catch (error) {
				if (this.continueOnFail()) {
					const json: IDataObject = { error: (error as Error).message };
					const description = (error as { description?: unknown }).description;
					if (typeof description === 'string' && description) json.errorDescription = description;
					if (requestId) json.request_id = requestId;
					returnData.push({ json, pairedItem: { item: i } });
					continue;
				}
				// Both constructors return the original error unchanged when it is already of that class
				if (error instanceof NodeApiError) {
					throw new NodeApiError(this.getNode(), error as unknown as JsonObject, { itemIndex: i });
				}
				throw new NodeOperationError(this.getNode(), error as Error, { itemIndex: i });
			}
		}

		return [returnData];
	}
}

function cleanRequestId(this: IExecuteFunctions, value: string, itemIndex: number): string {
	const requestId = String(value ?? '').trim();
	if (!requestId) {
		throw new NodeOperationError(this.getNode(), 'Request ID is empty', {
			itemIndex,
			description: 'Use the request_id from the Generate operation.',
		});
	}
	return requestId;
}

function parseJsonObject(
	this: IExecuteFunctions,
	value: unknown,
	fieldName: string,
	itemIndex: number,
): IDataObject {
	let parsed: unknown = value;
	if (typeof value === 'string') {
		if (!value.trim()) return {};
		try {
			parsed = JSON.parse(value);
		} catch {
			throw new NodeOperationError(this.getNode(), `${fieldName} is not valid JSON`, {
				itemIndex,
				description: 'Check for missing quotes, commas or brackets.',
			});
		}
	}
	if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
		throw new NodeOperationError(this.getNode(), `${fieldName} must be a JSON object`, {
			itemIndex,
			description: 'Wrap the fields in curly brackets, for example {"prompt": "a red car"}.',
		});
	}
	return parsed as IDataObject;
}

/** Builds the model path and request body from the node's fields. */
function buildRequest(this: IExecuteFunctions, itemIndex: number): { path: string; body: IDataObject } {
	const model = this.getNodeParameter('model', itemIndex) as string;

	if (model === 'custom') {
		let path = String(this.getNodeParameter('modelPath', itemIndex) ?? '').trim();
		path = path.replace(/^https?:\/\/[^/]+/i, '').replace(/^\/+/, '');
		if (!path) {
			throw new NodeOperationError(this.getNode(), 'Model Path is empty', {
				itemIndex,
				description: 'Copy the path from the model page in the Higgsfield Console.',
			});
		}
		const body = parseJsonObject.call(this, this.getNodeParameter('inputJson', itemIndex), 'Input (JSON)', itemIndex);
		return { path, body };
	}

	const prompt = String(this.getNodeParameter('prompt', itemIndex) ?? '').trim();
	if (!prompt) {
		throw new NodeOperationError(this.getNode(), 'Prompt is empty', {
			itemIndex,
			description: 'Type a prompt or map one from a previous node.',
		});
	}
	const body: IDataObject = { prompt };

	if (IMAGE_INPUT_MODELS.includes(model)) {
		const imageUrl = String(this.getNodeParameter('imageUrl', itemIndex) ?? '').trim();
		if (!/^https?:\/\//i.test(imageUrl)) {
			throw new NodeOperationError(this.getNode(), 'Image URL must be a public link starting with http or https', {
				itemIndex,
				description: `Received: "${imageUrl}"`,
			});
		}
		body.image_url = imageUrl;
	}

	const fields = this.getNodeParameter('additionalFields', itemIndex, {}) as IDataObject;
	if (SOUL_MODELS.includes(model)) {
		if (fields.aspectRatio !== undefined) body.aspect_ratio = fields.aspectRatio;
		if (fields.numImages !== undefined) body.num_images = fields.numImages;
		if (fields.resolution !== undefined) body.resolution = fields.resolution;
	}
	if (KLING_MODELS.includes(model)) {
		if (fields.klingDuration !== undefined) body.duration = fields.klingDuration;
		if (fields.cfgScale !== undefined) body.cfg_scale = fields.cfgScale;
		if (fields.negativePrompt) body.negative_prompt = fields.negativePrompt;
	}
	if (HAILUO_MODELS.includes(model)) {
		if (fields.hailuoDuration !== undefined) body.duration = fields.hailuoDuration;
		if (fields.promptOptimizer !== undefined) body.prompt_optimizer = fields.promptOptimizer;
	}
	if (fields.extraInput !== undefined) {
		Object.assign(body, parseJsonObject.call(this, fields.extraInput, 'Extra Input (JSON)', itemIndex));
	}

	return { path: model, body };
}
