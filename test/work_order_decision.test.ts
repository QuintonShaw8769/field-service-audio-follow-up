import assert from "node:assert/strict";
import test from "node:test";
import { decideWorkOrderUpdate, followUpRequestSchema } from "../src/work_order_decision.js";

test("a safety note reopens dispatch and records technician follow-up", () => {
  const request = followUpRequestSchema.parse({
    workOrderId: "WO-1842",
    technicianId: "tech-27",
    dispatchStatus: "completed",
    audio: {
      dataBase64: "UklGRg==",
      format: "wav",
      contentType: "audio/wav",
    },
    photos: [{
      url: "https://media.example.com/work-orders/WO-1842/panel.jpg",
      caption: "Panel after inspection",
    }],
  });

  const update = decideWorkOrderUpdate(
    request,
    "The repair is complete, but I found an electrical hazard by the panel.",
    "work-orders/WO-1842/tech-27.wav",
  );

  assert.equal(update.dispatchStatus, "needs_dispatch");
  assert.deepEqual(update.technicianFollowUp, {
    required: true,
    reason: "electrical hazard",
  });
  assert.equal(update.photos.length, 1);
});
