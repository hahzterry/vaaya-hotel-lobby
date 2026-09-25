# n8n-nodes-vaaya-hotel-lobby

n8n community node for the [Vaaya Hotel Lobby recipe](https://vaaya.ai/recipes/colors):
put yourself — or you and a friend — into the viral Hotel Lobby performance
video. Generation runs on **MiniMax H3** (`minimax/h3/reference-to-video`) via
[fal.ai](https://fal.ai), billed to **your own fal API key**.

Source: [github.com/MaruPelkar/n8n-nodes-vaaya-hotel-lobby](https://github.com/MaruPelkar/n8n-nodes-vaaya-hotel-lobby)

## Install

In n8n: **Settings → Community Nodes → Install** and enter
`n8n-nodes-vaaya-hotel-lobby`.

## Credentials

Create a **fal.ai API** credential with an API key from
[fal.ai → Dashboard → Keys](https://fal.ai/dashboard/keys). All generations are
billed by fal to that key (H3 is priced per second of video, up to ~$4.68 for
15s at 2K — see fal's pricing page for current rates).

## Usage

Node: **Vaaya Hotel Lobby**.

- **Variant** — `Standard` (the full 7-second clip) or `Extended` (the 29-second
  clip as reference; MiniMax H3 caps output at 15 seconds).
- **Left / Right performer photo URLs** — 1–5 public image URLs per person, as
  seen from the **viewer's** perspective in the source video. Fill either slot
  or both; an empty slot keeps the original performer. One clear face photo is
  enough; an outfit shot improves the match.
- **Creative notes** — optional identity/wardrobe notes. The scene and
  choreography are fixed by the recipe.
- **Consent** — you must confirm every person shown is you or an adult who gave
  permission. The node refuses to run without it.
- **Options** — resolution (default 2K), duration override (5–15s), aspect
  ratio (default 4:3, matching the source clip), a custom template video URL,
  and max wait time.

Output per item: `video_url` (the finished MP4 on fal's CDN), `request_id`,
and the raw fal response.

## Notes

- The reference clips are the same prepared assets the Vaaya product uses,
  served from `vaaya.ai/recipe-media/colors/`.
- H3 re-generates the scene from references; unlike the hosted Vaaya recipe it
  does not stream-copy the original audio track, so the soundtrack is model-
  generated. For the exact original audio, use the hosted recipe at
  [vaaya.ai/colors](https://vaaya.ai/colors).
- MiniMax's own content safety checks still apply upstream.

## License

MIT
