import type {
	IAuthenticateGeneric,
	Icon,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class HiggsfieldApi implements ICredentialType {
	name = 'higgsfieldApi';

	displayName = 'Higgsfield API';

	icon: Icon = {
		light: 'file:../nodes/Higgsfield/higgsfield.svg',
		dark: 'file:../nodes/Higgsfield/higgsfield.dark.svg',
	};

	documentationUrl = 'https://docs.higgsfield.ai/docs/authentication';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key ID',
			name: 'apiKeyId',
			type: 'string',
			required: true,
			default: '',
			description: 'The key ID from the API keys page in the Higgsfield Console',
		},
		{
			displayName: 'API Key Secret',
			name: 'apiKeySecret',
			type: 'string',
			typeOptions: { password: true },
			required: true,
			default: '',
			description: 'The secret shown once when you created the key in the Higgsfield Console',
		},
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'string',
			default: 'https://api.higgsfield.ai',
			description: 'Leave this as it is unless Higgsfield support gives you a different address',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Key {{$credentials.apiKeyId}}:{{$credentials.apiKeySecret}}',
			},
		},
	};

	// Higgsfield has no free endpoint that answers "OK", so the test looks up a request ID that
	// cannot exist. A working key gets 404 (not found), which is ignored. A wrong key gets 401,
	// which is not ignored, so n8n reports it with the message below.
	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.baseUrl}}',
			url: '/requests/00000000-0000-4000-8000-000000000000/status',
			method: 'GET',
			ignoreHttpStatusErrors: { ignore: true, except: [401, 403] },
		},
		rules: [
			{
				type: 'responseCode',
				properties: {
					value: 401,
					message: 'Higgsfield rejected this API key ID and secret',
				},
			},
			{
				type: 'responseCode',
				properties: {
					value: 403,
					message: 'Higgsfield refused access for this API key',
				},
			},
		],
	};
}
