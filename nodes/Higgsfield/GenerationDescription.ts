import type { INodeProperties } from 'n8n-workflow';

/** Model paths taken from Higgsfield's published API specification. */
export const MODELS = {
	soulStandard: 'higgsfield-ai/soul/standard',
	klingProImageToVideo: 'kling-video/v2.5-turbo/pro/image-to-video',
	klingProTextToVideo: 'kling-video/v2.5-turbo/pro/text-to-video',
	klingStandardImageToVideo: 'kling-video/v2.5-turbo/standard/image-to-video',
	hailuoImageToVideo: 'minimax/hailuo-2.3/standard/image-to-video',
	hailuoTextToVideo: 'minimax/hailuo-2.3/standard/text-to-video',
};

export const KNOWN_MODELS = Object.values(MODELS);
export const SOUL_MODELS = [MODELS.soulStandard];
export const KLING_MODELS = [
	MODELS.klingProImageToVideo,
	MODELS.klingProTextToVideo,
	MODELS.klingStandardImageToVideo,
];
export const HAILUO_MODELS = [MODELS.hailuoImageToVideo, MODELS.hailuoTextToVideo];
export const IMAGE_INPUT_MODELS = [
	MODELS.klingProImageToVideo,
	MODELS.klingStandardImageToVideo,
	MODELS.hailuoImageToVideo,
];

const forGenerate = { resource: ['generation'], operation: ['generate'] };

export const generationOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['generation'] } },
		options: [
			{
				name: 'Cancel',
				value: 'cancel',
				description: 'Cancel a generation that has not started yet',
				action: 'Cancel a generation',
			},
			{
				name: 'Delete',
				value: 'delete',
				description: "Delete a finished generation's files, prompt and settings from Higgsfield",
				action: 'Delete a generation',
			},
			{
				name: 'Generate',
				value: 'generate',
				description: 'Create an image or video with a Higgsfield model',
				action: 'Generate an image or video',
			},
			{
				name: 'Get Status',
				value: 'get',
				description: 'Get the status and result of a generation',
				action: 'Get the status of a generation',
			},
		],
		default: 'generate',
	},
];

export const generationFields: INodeProperties[] = [
	// Generate
	{
		displayName: 'Model',
		name: 'model',
		type: 'options',
		required: true,
		displayOptions: { show: forGenerate },
		options: [
			{
				name: 'Custom Model Path',
				value: 'custom',
				description: 'Use any other model from the Higgsfield Console',
			},
			{
				name: 'Kling 2.5 Turbo Pro: Image to Video',
				value: MODELS.klingProImageToVideo,
			},
			{
				name: 'Kling 2.5 Turbo Pro: Text to Video',
				value: MODELS.klingProTextToVideo,
			},
			{
				name: 'Kling 2.5 Turbo Standard: Image to Video',
				value: MODELS.klingStandardImageToVideo,
			},
			{
				name: 'Minimax Hailuo 2.3 Standard: Image to Video',
				value: MODELS.hailuoImageToVideo,
			},
			{
				name: 'Minimax Hailuo 2.3 Standard: Text to Video',
				value: MODELS.hailuoTextToVideo,
			},
			{
				name: 'Soul Standard: Text to Image',
				value: MODELS.soulStandard,
			},
		],
		default: 'higgsfield-ai/soul/standard',
		description: 'The Higgsfield model to use',
	},
	{
		displayName: 'Model Path',
		name: 'modelPath',
		type: 'string',
		required: true,
		displayOptions: { show: { ...forGenerate, model: ['custom'] } },
		default: '',
		placeholder: 'e.g. higgsfield-ai/soul/v2/standard',
		description:
			'The path from the model page in the Higgsfield Console, without https://api.higgsfield.ai',
	},
	{
		displayName: 'Input (JSON)',
		name: 'inputJson',
		type: 'json',
		required: true,
		displayOptions: { show: { ...forGenerate, model: ['custom'] } },
		default: '{\n  "prompt": ""\n}',
		description: 'The fields this model accepts. The model page in the Higgsfield Console lists them.',
	},
	{
		displayName: 'Prompt',
		name: 'prompt',
		type: 'string',
		required: true,
		typeOptions: { rows: 4 },
		displayOptions: { show: { ...forGenerate, model: KNOWN_MODELS } },
		default: '',
		description: 'What to create',
	},
	{
		displayName: 'Image URL',
		name: 'imageUrl',
		type: 'string',
		required: true,
		displayOptions: { show: { ...forGenerate, model: IMAGE_INPUT_MODELS } },
		default: '',
		placeholder: 'https://example.com/photo.jpg',
		description: 'A public link to the image the video starts from',
	},
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		displayOptions: { show: { ...forGenerate, model: KNOWN_MODELS } },
		default: {},
		options: [
			{
				displayName: 'Aspect Ratio',
				name: 'aspectRatio',
				type: 'options',
				displayOptions: { show: { '/model': SOUL_MODELS } },
				options: [
					{ name: '1:1', value: '1:1' },
					{ name: '16:9', value: '16:9' },
					{ name: '2:3', value: '2:3' },
					{ name: '21:9', value: '21:9' },
					{ name: '3:2', value: '3:2' },
					{ name: '3:4', value: '3:4' },
					{ name: '4:3', value: '4:3' },
					{ name: '4:5', value: '4:5' },
					{ name: '5:4', value: '5:4' },
					{ name: '9:16', value: '9:16' },
				],
				default: '4:3',
			},
			{
				displayName: 'CFG Scale',
				name: 'cfgScale',
				type: 'number',
				displayOptions: { show: { '/model': KLING_MODELS } },
				typeOptions: { minValue: 0, maxValue: 1, numberPrecision: 2 },
				default: 0.5,
				description: 'How closely the video follows the prompt, from 0 (loosely) to 1 (strictly)',
			},
			{
				displayName: 'Duration (Seconds)',
				name: 'klingDuration',
				type: 'options',
				displayOptions: { show: { '/model': KLING_MODELS } },
				options: [
					{ name: '5', value: 5 },
					{ name: '10', value: 10 },
				],
				default: 5,
			},
			{
				displayName: 'Duration (Seconds)',
				name: 'hailuoDuration',
				type: 'options',
				displayOptions: { show: { '/model': HAILUO_MODELS } },
				options: [
					{ name: '6', value: 6 },
					{ name: '10', value: 10 },
				],
				default: 6,
			},
			{
				displayName: 'Extra Input (JSON)',
				name: 'extraInput',
				type: 'json',
				default: '{}',
				description:
					'Any other fields the model accepts. They are added to the request and replace the fields above if the names match.',
			},
			{
				displayName: 'Negative Prompt',
				name: 'negativePrompt',
				type: 'string',
				displayOptions: { show: { '/model': KLING_MODELS } },
				default: '',
				description: 'What the video should avoid',
			},
			{
				displayName: 'Number of Images',
				name: 'numImages',
				type: 'number',
				displayOptions: { show: { '/model': SOUL_MODELS } },
				typeOptions: { minValue: 1, maxValue: 4 },
				default: 1,
			},
			{
				displayName: 'Prompt Optimizer',
				name: 'promptOptimizer',
				type: 'boolean',
				displayOptions: { show: { '/model': HAILUO_MODELS } },
				default: true,
				description: 'Whether to let the model rewrite the prompt to improve the result',
			},
			{
				displayName: 'Resolution',
				name: 'resolution',
				type: 'options',
				displayOptions: { show: { '/model': SOUL_MODELS } },
				options: [
					{ name: '2K', value: '2K' },
					{ name: '4K', value: '4K' },
				],
				default: '2K',
			},
		],
	},
	{
		displayName: 'Wait for Result',
		name: 'waitForResult',
		type: 'boolean',
		displayOptions: { show: forGenerate },
		default: true,
		description:
			'Whether to wait until Higgsfield finishes and return the result. Turn off to return straight away with the request ID.',
	},

	// Get Status, Cancel, Delete
	{
		displayName: 'Request ID',
		name: 'requestId',
		type: 'string',
		required: true,
		displayOptions: { show: { resource: ['generation'], operation: ['get', 'cancel', 'delete'] } },
		default: '',
		placeholder: 'e.g. 3f1c2d9e-8a7b-4c5d-9e0f-1a2b3c4d5e6f',
		description: 'The request_id returned by the Generate operation',
	},
	{
		displayName: 'Wait for Result',
		name: 'waitForResult',
		type: 'boolean',
		displayOptions: { show: { resource: ['generation'], operation: ['get'] } },
		default: false,
		description: 'Whether to keep checking until the generation has finished',
	},

	// Options for Generate and Get Status
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		displayOptions: { show: { resource: ['generation'], operation: ['generate', 'get'] } },
		default: {},
		options: [
			{
				displayName: 'Download Files',
				name: 'downloadFiles',
				type: 'boolean',
				default: false,
				description:
					'Whether to download finished files into the item as binary data. Higgsfield deletes them seven days after the generation finishes.',
			},
			{
				displayName: 'Idempotency Key',
				name: 'idempotencyKey',
				type: 'string',
				displayOptions: { show: { '/operation': ['generate'] } },
				default: '',
				description:
					'A unique value for this generation. If the same request is sent again with the same key, Higgsfield returns the first generation instead of starting and charging for a new one.',
			},
			{
				displayName: 'Max Wait Time (Minutes)',
				name: 'maxWaitMinutes',
				type: 'number',
				typeOptions: { minValue: 1, maxValue: 120 },
				default: 15,
				description: 'How long to keep checking before giving up. The generation keeps running at Higgsfield.',
			},
			{
				displayName: 'Poll Interval (Seconds)',
				name: 'pollIntervalSeconds',
				type: 'number',
				typeOptions: { minValue: 2, maxValue: 60 },
				default: 5,
				description: 'How often to check whether the generation has finished',
			},
			{
				displayName: 'Webhook URL',
				name: 'webhookUrl',
				type: 'string',
				displayOptions: { show: { '/operation': ['generate'] } },
				default: '',
				placeholder: 'https://example.com/webhook',
				description:
					'Higgsfield sends the finished result to this address. To pause the workflow until then, turn off Wait for Result, put {{ $execution.resumeUrl }} here and add a Wait node set to resume on a webhook call.',
			},
		],
	},
];
