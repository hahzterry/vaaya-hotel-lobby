import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow'
import { NodeApiError, NodeOperationError } from 'n8n-workflow'

// The prepared Hotel Lobby performance clips committed in the Vaaya repo
// (apps/web/public/recipe-media/colors) and served from vaaya.ai.
const TEMPLATE_URLS: Record<string, string> = {
	standard: 'https://vaaya.ai/recipe-media/colors/standard.mp4',
	extended: 'https://vaaya.ai/recipe-media/colors/extended.mp4',
}
// MiniMax H3 generates 5–15 seconds; Standard is the full 7s clip, Extended
// (29s source) is capped at H3's 15-second maximum.
const TEMPLATE_SECONDS: Record<string, number> = { standard: 7, extended: 15 }
const H3_MAX_SECONDS = 15
const H3_MIN_SECONDS = 5

const FAL_QUEUE_URL = 'https://queue.fal.run/minimax/h3/reference-to-video'

type Performer = { slot: 'left' | 'right'; photoUrls: string[] }

// Same slot contract as the Vaaya recipe (lib/colors/contract.ts), rephrased
// for H3's "Image 1 … Image N" reference convention.
function composePrompt(performers: Performer[], notes: string): string {
	let index = 0
	const both = performers.length === 2
	const identities = performers.map((person) => {
		const references = person.photoUrls.map(() => `Image ${++index}`).join(', ')
		const who = both ? `the ${person.slot.toUpperCase()} person` : 'this person'
		const photos =
			person.photoUrls.length === 1
				? `This photo shows ${who}`
				: `These photos all show ${who}`
		return `Replace the performer on the ${person.slot.toUpperCase()} of the reference video with the adult shown in ${references}. ${photos}; use their identity and wardrobe.`
	})
	const pair = both
		? [
				'Replace BOTH performers with two different people: the LEFT performer becomes only the LEFT person and the RIGHT performer becomes only the RIGHT person. Never swap sides, merge the two faces, or reuse one identity for both performers.',
			]
		: []
	return [
		'Recreate the reference video exactly. Preserve the performance, motion, timing, camera, scene, soundtrack and every unassigned performer.',
		'LEFT and RIGHT refer to the viewer’s perspective in the source video, not the reference photos or the performers’ own left and right.',
		...identities,
		...pair,
		'Reference photos supply identity and wardrobe only. Do not add people, jewelry, glasses or scene elements absent from the references.',
		both
			? 'Apply the following creative notes to both assigned performers ("me", "us" or "we" means both people); do not change the slot mapping above or the source scene:'
			: 'Apply the following creative notes only to the assigned performers; do not change the slot mapping or source scene:',
		JSON.stringify(notes || 'No extra notes.'),
	].join('\n')
}

function parseUrlList(raw: string): string[] {
	return raw
		.split(/[\n,]/)
		.map((url) => url.trim())
		.filter(Boolean)
}

export class HotelLobby implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Vaaya Hotel Lobby',
		name: 'vaayaHotelLobby',
		icon: 'file:hotelLobby.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["variant"]}} · MiniMax H3',
		description:
			'Put one or two people into the viral Hotel Lobby performance video, generated with MiniMax H3 on fal.ai using your own fal key',
		defaults: { name: 'Vaaya Hotel Lobby' },
		inputs: ['main'],
		outputs: ['main'],
		credentials: [{ name: 'falApi', required: true }],
		properties: [
			{
				displayName: 'Variant',
				name: 'variant',
				type: 'options',
				options: [
					{ name: 'Standard (7s)', value: 'standard' },
					{
						name: 'Extended (First 15s of the 29s Clip)',
						value: 'extended',
						description: 'MiniMax H3 generates at most 15 seconds',
					},
				],
				default: 'standard',
			},
			{
				displayName: 'Left Performer Photo URLs',
				name: 'leftPhotoUrls',
				type: 'string',
				typeOptions: { rows: 3 },
				default: '',
				placeholder: 'https://…/face.jpg, https://…/outfit.jpg',
				description:
					'1–5 public image URLs of the person to place on the viewer’s LEFT. Leave empty to keep the original left performer. One clear face photo is enough; an outfit shot improves the match.',
			},
			{
				displayName: 'Right Performer Photo URLs',
				name: 'rightPhotoUrls',
				type: 'string',
				typeOptions: { rows: 3 },
				default: '',
				placeholder: 'https://…/face.jpg',
				description:
					'1–5 public image URLs of the person to place on the viewer’s RIGHT. Leave empty to keep the original right performer.',
			},
			{
				displayName: 'Creative Notes',
				name: 'prompt',
				type: 'string',
				typeOptions: { rows: 2 },
				default: '',
				placeholder: 'Keep my leather jacket',
				description:
					'Optional notes about identity and wardrobe. The scene and choreography are fixed by the recipe.',
			},
			{
				displayName: 'I Have Consent From Every Person Shown',
				name: 'consent',
				type: 'boolean',
				default: false,
				description:
					'Whether every person in the photos is you or an adult who gave permission to appear in the generated video',
			},
			{
				displayName: 'Options',
				name: 'options',
				type: 'collection',
				placeholder: 'Add option',
				default: {},
				options: [
					{
						displayName: 'Resolution',
						name: 'resolution',
						type: 'options',
						options: [
							{ name: '1080P', value: '1080P' },
							{ name: '2K', value: '2K' },
						],
						default: '2K',
					},
					{
						displayName: 'Duration (Seconds)',
						name: 'duration',
						type: 'number',
						typeOptions: { minValue: H3_MIN_SECONDS, maxValue: H3_MAX_SECONDS },
						default: 0,
						description:
							'Override the variant default (5–15). 0 uses the variant default.',
					},
					{
						displayName: 'Aspect Ratio',
						name: 'aspectRatio',
						type: 'options',
						options: [
							{ name: '4:3 (Source Clip)', value: '4:3' },
							{ name: '16:9', value: '16:9' },
							{ name: '9:16', value: '9:16' },
							{ name: '1:1', value: '1:1' },
						],
						default: '4:3',
					},
					{
						displayName: 'Template Video URL',
						name: 'templateUrl',
						type: 'string',
						default: '',
						description: 'Replace the built-in Hotel Lobby clip with your own reference video URL',
					},
					{
						displayName: 'Max Wait (Minutes)',
						name: 'maxWaitMinutes',
						type: 'number',
						typeOptions: { minValue: 1, maxValue: 60 },
						default: 20,
						description: 'How long to poll fal before failing the item',
					},
				],
			},
		],
	}

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData()
		const returnData: INodeExecutionData[] = []

		for (let i = 0; i < items.length; i++) {
			const variant = this.getNodeParameter('variant', i) as 'standard' | 'extended'
			const notes = this.getNodeParameter('prompt', i) as string
			const consent = this.getNodeParameter('consent', i) as boolean
			const options = this.getNodeParameter('options', i) as {
				resolution?: string
				duration?: number
				aspectRatio?: string
				templateUrl?: string
				maxWaitMinutes?: number
			}

			const performers: Performer[] = []
			for (const slot of ['left', 'right'] as const) {
				const urls = parseUrlList(this.getNodeParameter(`${slot}PhotoUrls`, i) as string)
				if (urls.length === 0) continue
				if (urls.length > 5)
					throw new NodeOperationError(
						this.getNode(),
						`At most 5 photo URLs per performer (${slot} has ${urls.length})`,
						{ itemIndex: i },
					)
				const invalid = urls.find((url) => !/^https?:\/\//.test(url))
				if (invalid)
					throw new NodeOperationError(
						this.getNode(),
						`Photo URLs must be public http(s) URLs; got "${invalid}"`,
						{ itemIndex: i },
					)
				performers.push({ slot, photoUrls: urls })
			}
			if (performers.length === 0)
				throw new NodeOperationError(
					this.getNode(),
					'Provide photo URLs for the left performer, the right performer, or both',
					{ itemIndex: i },
				)
			if (!consent)
				throw new NodeOperationError(
					this.getNode(),
					'Confirm consent: every person in the photos must be you or an adult who gave permission',
					{ itemIndex: i },
				)

			const duration =
				options.duration && options.duration > 0
					? Math.min(Math.max(options.duration, H3_MIN_SECONDS), H3_MAX_SECONDS)
					: TEMPLATE_SECONDS[variant]
			const body = {
				prompt: composePrompt(performers, notes),
				reference_image_urls: performers.flatMap((p) => p.photoUrls),
				reference_video_urls: [options.templateUrl?.trim() || TEMPLATE_URLS[variant]],
				duration,
				resolution: options.resolution ?? '2K',
				aspect_ratio: options.aspectRatio ?? '4:3',
			}

			// fal queue: submit, then poll the returned status/response URLs.
			const submitted = (await this.helpers.httpRequestWithAuthentication.call(this, 'falApi', {
				method: 'POST',
				url: FAL_QUEUE_URL,
				body,
				json: true,
			})) as { request_id?: string; status_url?: string; response_url?: string }
			if (!submitted.request_id || !submitted.response_url)
				throw new NodeApiError(this.getNode(), submitted as never, {
					message: 'fal queue submit returned no request id',
				})
			const statusUrl = submitted.status_url ?? `${submitted.response_url}/status`

			const deadline = Date.now() + (options.maxWaitMinutes ?? 20) * 60_000
			let status = 'IN_QUEUE'
			while (Date.now() < deadline) {
				const poll = (await this.helpers.httpRequestWithAuthentication.call(this, 'falApi', {
					method: 'GET',
					url: statusUrl,
					json: true,
				})) as { status?: string }
				status = poll.status ?? status
				if (status === 'COMPLETED') break
				if (status === 'FAILED' || status === 'CANCELLED' || status === 'ERROR')
					throw new NodeApiError(this.getNode(), poll as never, {
						message: `fal generation ${status.toLowerCase()} (request ${submitted.request_id})`,
					})
				await new Promise((resolve) => setTimeout(resolve, 10_000))
			}
			if (status !== 'COMPLETED')
				throw new NodeOperationError(
					this.getNode(),
					`Timed out after ${options.maxWaitMinutes ?? 20} minutes waiting for fal request ${submitted.request_id}; it may still finish — check fal.ai/dashboard/requests`,
					{ itemIndex: i },
				)

			const result = (await this.helpers.httpRequestWithAuthentication.call(this, 'falApi', {
				method: 'GET',
				url: submitted.response_url,
				json: true,
			})) as { video?: { url?: string } }

			returnData.push({
				json: {
					video_url: result.video?.url ?? null,
					request_id: submitted.request_id,
					variant,
					duration,
					model: 'minimax/h3/reference-to-video',
					raw: result,
				},
				pairedItem: { item: i },
			})
		}

		return [returnData]
	}
}
