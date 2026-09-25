import type { IAuthenticateGeneric, ICredentialType, INodeProperties } from 'n8n-workflow'

export class FalApi implements ICredentialType {
	name = 'falApi'
	displayName = 'fal.ai API'
	documentationUrl = 'https://fal.ai/dashboard/keys'
	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description:
				'Your own fal.ai API key (created at fal.ai → Dashboard → Keys). Generations are billed to your fal account.',
		},
	]

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Key {{$credentials.apiKey}}',
			},
		},
	}
}
