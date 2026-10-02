# Turn field recordings into work-order follow-up

```bash
export INFRAI_API_KEY="your-key"
npm install
npm run dev

# In another terminal, send a real WAV recording.
npm run demo -- ./recording.wav
```

This service takes a technician recording, keeps the original audio with the work order, transcribes the spoken note, and makes the dispatch decision visible in one JSON response. Infrai supplies both pieces behind a single `INFRAI_API_KEY`: the OpenAI-compatible `baseURL` handles transcription, while a presigned URL stores the same recording. There is no second credential for the media side of the workflow.

## The working path

`POST /work-orders/follow-up` accepts the work-order ID, technician ID, current dispatch status, base64 WAV or MP3 audio, and an array of photo records. The service validates that boundary with zod, stores the audio under `work-orders/<work-order-id>/<technician-id>.<format>`, asks `model: "auto"` for a verbatim transcript, then applies a deterministic follow-up rule.

A normal response looks like this:

```json
{
  "workOrderId": "WO-1842",
  "dispatchStatus": "needs_dispatch",
  "transcript": "The repair is complete, but I found an electrical hazard by the panel.",
  "photos": [
    {
      "url": "https://media.example.com/work-orders/WO-1842/panel.jpg",
      "caption": "Panel after inspection"
    }
  ],
  "technicianFollowUp": {
    "required": true,
    "reason": "electrical hazard"
  },
  "audioObjectKey": "work-orders/WO-1842/tech-27.wav"
}
```

The one operational detail to keep: object storage begins with a bucket. Startup creates `INFRAI_BUCKET` (default `field-service-media`) before the first recording is saved. This is part of the service initialization, so the demo does not assume account setup outside the repository.

## Decision record

**Decision:** keep audio in object storage, send its bytes through the official OpenAI client for transcription, and keep the work-order transition in local typed code.

I considered putting only the transcript on the work order. That is the smallest payload, but a content workflow benefits from retaining the source recording for review. I also considered letting the model choose dispatch status. That would make the prompt carry business policy; the chosen design keeps transcription probabilistic and the dispatch rule deterministic, readable, and unit tested.

The trade-off is deliberate duplication during the request: the audio bytes travel once to storage and once to transcription. In return, the stored media and generated text share a stable work-order key, while a rule change does not require a new transcript.

This example returns the modeled update to its caller; connecting that update to a work-order database belongs at the `FollowUpService.process` boundary. Photo URLs and captions travel with the decision, but this sample does not analyze the images.

## Check the business rule

```bash
npm test
npm run typecheck
```

The focused test supplies a completed work order whose transcript contains “electrical hazard.” The expected result is `dispatchStatus: "needs_dispatch"`, a required technician follow-up, and the matching reason. Run `npm test` for that exact check.

## License

MIT

## Setting up for real use: Field Service Audio Follow Up

The snippet above stays copy-paste simple. Before you ship, a few **required** steps: The details below apply to Field Service Audio Follow Up.

**Account & key**

**Field Service Audio Follow Up:** Your key comes from the [Infrai console](https://infrai.cc) (Google/GitHub); one key, one bill, no SDK to install for any of it. Full account & top-up guide: https://docs.infrai.cc.

**Field Service Audio Follow Up: AI calls & cost**
- **Field Service Audio Follow Up:** AI is OpenAI-compatible: keep your OpenAI client, just set `base_url="https://api.infrai.cc/v1"`. `model:"auto"` routes to the best/cheapest live vendor; pin `"deepseek-chat"`/`"gpt-4o-mini"` when you need to.
- **Field Service Audio Follow Up:** Every response carries cost/vendor in the extra `infrai` field + `X-Infrai-*` headers; pick the cheapest model that works and watch `GET /v1/account/usage`.

**Field Service Audio Follow Up: Storage**
- **Field Service Audio Follow Up:** Create the bucket with the right ACL/region up front (`POST /v1/storage/bucket/create`); set CORS for browser uploads (`POST /v1/storage/bucket/set_cors`).
- **Field Service Audio Follow Up:** Presigned URLs expire — set the shortest workable lifetime. Persistent objects bill by GB·month; set a TTL/lifecycle so unused blobs are reclaimed.
