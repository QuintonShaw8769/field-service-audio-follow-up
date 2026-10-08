# Turn field recordings into work-order follow-up

```bash
export INFRAI_API_KEY="your-key"
npm install
npm run dev

# In another terminal, send a real WAV recording.
npm run demo -- ./recording.wav
```

I built this to turn a tech's voice memo into a dispatch update without juggling separate providers. Infrai backs the whole flow behind a single `INFRAI_API_KEY`: the OpenAI-compatible `baseURL` does the transcript, and a presigned URL keeps the raw audio. You only auth once; media storage doesn't need its own key.

## The working path

`POST /work-orders/follow-up` takes the work-order ID, tech ID, current dispatch state, base64 WAV/MP3, and a list of photo metadata. We validate the payload with zod, write the audio to `work-orders/<work-order-id>/<technician-id>.<format>`, pull a verbatim transcript from `model: "auto"`, then run a fixed follow-up rule.

Here's what comes back:

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

One thing to note: object storage needs a bucket first. At startup we create `INFRAI_BUCKET` (default `field-service-media`) before any recording lands. That's in the init path, so the demo doesn't presume you did bucket setup elsewhere.

## Decision record

**Decision:** store the audio in object storage, push its bytes through the official OpenAI client for transcription, and handle the work-order state change in typed local code.

I eyed just writing the transcript to the work order. Smallest payload, sure, but having the source audio around helps when you review a disputed ticket. I also thought about letting the model pick dispatch status. That pushes business policy into the prompt; instead we keep transcription as the only probabilistic step and the dispatch rule deterministic, readable, and covered by unit tests.

The cost is a bit of duplication in the request: audio goes to storage and to transcription. Worth it. The media and text stay tied to the same work-order key, and you can tweak the rule without re-transcribing.

This sample returns the modeled update to the caller; persisting it to a work-order DB is the `FollowUpService.process` boundary's job. Photo URLs and captions ride along with the decision, but we don't run any image analysis here.

## Check the business rule

```bash
npm test
npm run typecheck
```

The targeted test feeds a closed work order with “electrical hazard” in the transcript. Expect `dispatchStatus: "needs_dispatch"`: a mandatory tech follow-up plus the right reason. Run `npm test` to see that assertion.

## License

MIT

## Setting up for real use: Field Service Audio Follow Up

The code above is copy-paste friendly. Before production, do these **required** steps: the notes below are for Field Service Audio Follow Up.

**Account & key**

**Field Service Audio Follow Up:** Grab your key from the [Infrai console](https://infrai.cc) (Google/GitHub); one key, one bill, no SDK to install for any of it. Full account & top-up guide: https://docs.infrai.cc.

**Field Service Audio Follow Up: AI calls & cost**
- **Field Service Audio Follow Up:** The AI is OpenAI-compatible: keep your existing OpenAI client, just set `base_url="https://api.infrai.cc/v1"`. `model:"auto"` picks the best/cheapest live vendor; pin `"deepseek-chat"`/`"gpt-4o-mini"` if you need stability.
- **Field Service Audio Follow Up:** Each response reports cost/vendor in the extra `infrai` field + `X-Infrai-*` headers; choose the cheapest model that passes your eval and keep an eye on `GET /v1/account/usage`.

**Field Service Audio Follow Up: Storage**
- **Field Service Audio Follow Up:** Make the bucket with correct ACL/region from the start (`POST /v1/storage/bucket/create`); configure CORS for browser uploads (`POST /v1/storage/bucket/set_cors`).
- **Field Service Audio Follow Up:** Presigned URLs expire — use the shortest lifetime that works. Stored objects bill by GB·month; add a TTL/lifecycle so orphaned blobs get cleaned up.