import type {
	IBinaryKeyData,
	IDataObject,
	IExecuteFunctions,
	IHttpRequestMethods,
	IHttpRequestOptions,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeOperationError, sleepWithAbort } from 'n8n-workflow';

export const DEFAULT_BASE_URL = 'https://api.higgsfield.ai';

export const TERMINAL_STATUSES = ['completed', 'failed', 'nsfw', 'canceled'];

export type RequestContext = 'submit' | 'status' | 'cancel' | 'delete';

export interface HiggsfieldResponse {
	statusCode: number;
	headers: IDataObject;
	body: unknown;
}

/** Sends one request to the Higgsfield API and returns the status code and body without throwing on HTTP errors. */
export async function higgsfieldRequest(
	this: IExecuteFunctions,
	method: IHttpRequestMethods,
	path: string,
	itemIndex: number,
	body?: IDataObject,
	headers?: IDataObject,
): Promise<HiggsfieldResponse> {
	const credentials = await this.getCredentials('higgsfieldApi', itemIndex);
	const baseURL = String(credentials.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');

	const options: IHttpRequestOptions = {
		method,
		baseURL,
		url: path.startsWith('/') ? path : `/${path}`,
		json: true,
		returnFullResponse: true,
		ignoreHttpStatusErrors: true,
		headers: { Accept: 'application/json', ...(headers ?? {}) },
	};
	if (body !== undefined) options.body = body;

	try {
		const response = (await this.helpers.httpRequestWithAuthentication.call(
			this,
			'higgsfieldApi',
			options,
		)) as { statusCode: number; headers?: IDataObject; body: unknown };
		return { statusCode: response.statusCode, headers: response.headers ?? {}, body: response.body };
	} catch (error) {
		throw new NodeApiError(this.getNode(), error as JsonObject, {
			itemIndex,
			message: 'Could not reach Higgsfield',
			description: 'Check your internet connection and the Base URL in your Higgsfield credential.',
		});
	}
}

/** Reads Higgsfield's "detail" field, which is either a sentence or a list of validation problems. */
export function readDetail(body: unknown): string {
	if (!body || typeof body !== 'object') return typeof body === 'string' ? body : '';
	const detail = (body as IDataObject).detail;
	if (typeof detail === 'string') return detail;
	if (Array.isArray(detail)) {
		return detail
			.map((entry) => {
				if (entry && typeof entry === 'object') {
					const problem = entry as IDataObject;
					const location = Array.isArray(problem.loc) ? problem.loc.join('.') : '';
					const message = typeof problem.msg === 'string' ? problem.msg : JSON.stringify(problem);
					return location ? `${location}: ${message}` : message;
				}
				return String(entry);
			})
			.join('; ');
	}
	return '';
}

/** Turns a failed Higgsfield response into an error a non-developer can act on. */
export function apiError(
	this: IExecuteFunctions,
	response: HiggsfieldResponse,
	context: RequestContext,
	itemIndex: number,
): NodeApiError {
	const { statusCode, body } = response;
	const detail = readDetail(body);
	let message: string;
	let description: string;

	if (statusCode === 400 && context === 'cancel') {
		// n8n marks a whole run as canceled when an error message contains that word, so it is avoided here
		message = 'This generation has already started, so the Cancel operation cannot stop it';
		description = 'Only generations that are still waiting in the queue can be stopped.';
	} else if (statusCode === 400 || statusCode === 422) {
		message = 'Higgsfield did not accept the input';
		description = detail || 'Check the fields against the model page in the Higgsfield Console.';
	} else if (statusCode === 401) {
		message = 'Higgsfield rejected the API key';
		description = 'Check the API key ID and secret in your Higgsfield credential.';
	} else if (statusCode === 403) {
		message = 'Your Higgsfield API balance is too low';
		description =
			'Add funds to your API balance in the Higgsfield Console, then run the node again.' +
			(detail ? ` Higgsfield said: ${detail}` : '');
	} else if (statusCode === 404 && context === 'submit') {
		message = 'Higgsfield could not find this model';
		description = 'Check the model path. You can copy it from the model page in the Higgsfield Console.';
	} else if (statusCode === 404) {
		message = 'Higgsfield could not find this request';
		description =
			'Check the request ID. Higgsfield removes requests seven days after they finish, or sooner if they were deleted.';
	} else if (statusCode === 409) {
		message = 'This generation is still running';
		description = 'Wait until it has finished, then try again.';
	} else if (statusCode === 423) {
		message = 'This model is temporarily unavailable';
		description = detail || 'Try again later.';
	} else if (statusCode === 429) {
		message = 'Higgsfield is busy for this account';
		description = 'Your generation queue is full or a rate limit was reached. Try again in a few minutes.';
	} else if (statusCode >= 500) {
		message = 'Higgsfield had a server problem';
		description = detail || 'Try again in a few minutes.';
	} else {
		message = `Higgsfield returned an unexpected response (HTTP ${statusCode})`;
		description = detail;
	}

	const errorBody: JsonObject =
		body && typeof body === 'object' ? (body as JsonObject) : { detail: detail || message };
	return new NodeApiError(this.getNode(), errorBody, {
		itemIndex,
		message,
		description,
		httpCode: String(statusCode),
	});
}

function retryAfterMs(headers: IDataObject): number {
	const seconds = Number(headers['retry-after']);
	if (Number.isFinite(seconds) && seconds > 0) return Math.min(seconds, 60) * 1000;
	return 10000;
}

/**
 * Submits a generation. Retries only when Higgsfield says the request was not admitted
 * (429 queue full, 503 not ready), so a retry can never start a second paid generation.
 */
export async function submitGeneration(
	this: IExecuteFunctions,
	path: string,
	body: IDataObject,
	itemIndex: number,
	headers?: IDataObject,
): Promise<IDataObject> {
	const signal = this.getExecutionCancelSignal();
	const maxAttempts = 3;
	for (let attempt = 1; ; attempt++) {
		const response = await higgsfieldRequest.call(this, 'POST', path, itemIndex, body, headers);
		if (response.statusCode >= 200 && response.statusCode < 300) {
			if (!response.body || typeof response.body !== 'object' || !(response.body as IDataObject).request_id) {
				throw new NodeOperationError(this.getNode(), 'Higgsfield accepted the request but sent no request ID', {
					itemIndex,
					description: `Response: ${JSON.stringify(response.body)}`,
				});
			}
			return response.body as IDataObject;
		}
		const canRetry = response.statusCode === 429 || response.statusCode === 503;
		if (!canRetry || attempt >= maxAttempts || signal?.aborted) {
			throw apiError.call(this, response, 'submit', itemIndex);
		}
		await sleepWithAbort(retryAfterMs(response.headers), signal);
	}
}

/** Gets the current status once. */
export async function getStatus(
	this: IExecuteFunctions,
	requestId: string,
	itemIndex: number,
): Promise<IDataObject> {
	const response = await higgsfieldRequest.call(
		this,
		'GET',
		`/requests/${encodeURIComponent(requestId)}/status`,
		itemIndex,
	);
	if (response.statusCode >= 200 && response.statusCode < 300 && response.body && typeof response.body === 'object') {
		return response.body as IDataObject;
	}
	throw apiError.call(this, response, 'status', itemIndex);
}

/** Checks the status every few seconds until the generation finishes or the time limit is reached. */
export async function waitForResult(
	this: IExecuteFunctions,
	requestId: string,
	itemIndex: number,
	pollIntervalSeconds: number,
	maxWaitMinutes: number,
): Promise<IDataObject> {
	const signal = this.getExecutionCancelSignal();
	const pollMs = Math.max(2, pollIntervalSeconds) * 1000;
	const deadline = Date.now() + Math.max(1, maxWaitMinutes) * 60000;
	let lastStatus = 'queued';
	let failuresInARow = 0;

	for (;;) {
		if (signal?.aborted) {
			throw new NodeOperationError(this.getNode(), 'The execution was stopped while waiting for Higgsfield', {
				itemIndex,
				description: `Request ID: ${requestId}`,
			});
		}

		const response = await higgsfieldRequest.call(
			this,
			'GET',
			`/requests/${encodeURIComponent(requestId)}/status`,
			itemIndex,
		);
		const ok = response.statusCode >= 200 && response.statusCode < 300 && response.body && typeof response.body === 'object';
		if (ok) {
			failuresInARow = 0;
			const status = response.body as IDataObject;
			lastStatus = String(status.status ?? lastStatus);
			if (TERMINAL_STATUSES.includes(lastStatus)) return status;
		} else if (response.statusCode === 429 || response.statusCode >= 500) {
			failuresInARow++;
			if (failuresInARow >= 5) throw apiError.call(this, response, 'status', itemIndex);
		} else {
			throw apiError.call(this, response, 'status', itemIndex);
		}

		if (Date.now() + pollMs > deadline) {
			throw new NodeOperationError(
				this.getNode(),
				`Higgsfield was still working on this request after ${maxWaitMinutes} minutes`,
				{
					itemIndex,
					description: `Request ID: ${requestId}. Last status: ${lastStatus}. Use the Get Status operation with this ID later, or raise Max Wait Time in the node options.`,
				},
			);
		}
		await sleepWithAbort(pollMs, signal);
	}
}

/** Throws a clear error when a finished generation did not succeed. */
export function assertCompleted(
	this: IExecuteFunctions,
	result: IDataObject,
	itemIndex: number,
): void {
	const status = String(result.status);
	const requestId = String(result.request_id ?? '');
	const reason = typeof result.error === 'string' && result.error ? result.error : '';
	if (status === 'completed') return;
	if (status === 'nsfw') {
		throw new NodeOperationError(this.getNode(), 'Higgsfield blocked this generation under its content rules', {
			itemIndex,
			description: `The prompt, an input file or the result was flagged by content moderation. Blocked generations are not charged. Request ID: ${requestId}`,
		});
	}
	if (status === 'canceled') {
		throw new NodeOperationError(this.getNode(), 'This generation was stopped before it started', {
			itemIndex,
			description: `Request ID: ${requestId}`,
		});
	}
	throw new NodeOperationError(this.getNode(), 'Higgsfield could not finish this generation', {
		itemIndex,
		description: `${reason || 'Higgsfield gave no reason.'} Failed generations are not charged. Request ID: ${requestId}`,
	});
}

/** Collects every output file link (images, video, audio and any other file objects) from a status response. */
export function collectOutputUrls(result: IDataObject): string[] {
	const urls: string[] = [];
	const add = (value: unknown) => {
		if (value && typeof value === 'object' && !Array.isArray(value)) {
			const url = (value as IDataObject).url;
			if (typeof url === 'string' && url) urls.push(url);
		}
	};
	for (const [key, value] of Object.entries(result)) {
		if (key === 'status_url' || key === 'cancel_url') continue;
		if (Array.isArray(value)) value.forEach(add);
		else add(value);
	}
	return urls;
}

function fileNameFromUrl(url: string, index: number): string {
	try {
		const last = new URL(url).pathname.split('/').filter(Boolean).pop();
		if (last) return decodeURIComponent(last);
	} catch {
		// Not a valid URL; fall back to a numbered name
	}
	return `higgsfield-output-${index + 1}`;
}

/** Downloads the output files into binary properties named data, data1, data2 and so on. */
export async function downloadOutputs(
	this: IExecuteFunctions,
	urls: string[],
	itemIndex: number,
): Promise<IBinaryKeyData> {
	const binary: IBinaryKeyData = {};
	for (let index = 0; index < urls.length; index++) {
		let response: { body: unknown; headers?: IDataObject };
		try {
			response = (await this.helpers.httpRequest({
				method: 'GET',
				url: urls[index],
				encoding: 'arraybuffer',
				returnFullResponse: true,
				json: false,
			})) as { body: unknown; headers?: IDataObject };
		} catch (error) {
			throw new NodeApiError(this.getNode(), error as JsonObject, {
				itemIndex,
				message: 'Could not download a Higgsfield output file',
				description: `File: ${urls[index]}. Output files expire seven days after the generation finishes.`,
			});
		}
		const contentType = String(response.headers?.['content-type'] ?? '').split(';')[0].trim();
		const data = Buffer.from(response.body as ArrayBuffer);
		binary[index === 0 ? 'data' : `data${index}`] = await this.helpers.prepareBinaryData(
			data,
			fileNameFromUrl(urls[index], index),
			contentType || undefined,
		);
	}
	return binary;
}
