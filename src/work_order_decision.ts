import { z } from "zod";

export const followUpRequestSchema = z.object({
  workOrderId: z.string().min(1),
  technicianId: z.string().min(1),
  dispatchStatus: z.enum(["dispatched", "on_site", "completed"]),
  audio: z.object({
    dataBase64: z.string().min(1),
    format: z.enum(["wav", "mp3"]),
    contentType: z.enum(["audio/wav", "audio/mpeg"]),
  }),
  photos: z.array(z.object({
    url: z.string().url(),
    caption: z.string().min(1).optional(),
  })).max(12),
});

export type FollowUpRequest = z.infer<typeof followUpRequestSchema>;

export type WorkOrderUpdate = {
  workOrderId: string;
  dispatchStatus: "completed" | "needs_dispatch";
  transcript: string;
  photos: FollowUpRequest["photos"];
  technicianFollowUp: {
    required: boolean;
    reason: string | null;
  };
  audioObjectKey: string;
};

const dispatchTerms = [
  "gas leak",
  "electrical hazard",
  "unsafe",
  "replacement part",
  "return visit",
];

export function decideWorkOrderUpdate(
  request: FollowUpRequest,
  transcript: string,
  audioObjectKey: string,
): WorkOrderUpdate {
  const normalized = transcript.toLowerCase();
  const reason = dispatchTerms.find((term) => normalized.includes(term)) ?? null;

  return {
    workOrderId: request.workOrderId,
    dispatchStatus: reason ? "needs_dispatch" : "completed",
    transcript,
    photos: request.photos,
    technicianFollowUp: {
      required: reason !== null,
      reason,
    },
    audioObjectKey,
  };
}
