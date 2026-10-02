import { InfraiMedia } from "./infrai_media.js";
import {
  decideWorkOrderUpdate,
  type FollowUpRequest,
  type WorkOrderUpdate,
} from "./work_order_decision.js";

export class FollowUpService {
  private readonly media: InfraiMedia;
  private readonly bucket: string;

  constructor(
    media: InfraiMedia,
    bucket: string,
  ) {
    this.media = media;
    this.bucket = bucket;
  }

  async initialize(): Promise<void> {
    await this.media.ensureBucket(this.bucket);
  }

  async process(request: FollowUpRequest): Promise<WorkOrderUpdate> {
    const audioObjectKey = [
      "work-orders",
      encodeURIComponent(request.workOrderId),
      `${encodeURIComponent(request.technicianId)}.${request.audio.format}`,
    ].join("/");
    const bytes = Buffer.from(request.audio.dataBase64, "base64");
    const idempotencyKey = `audio-${request.workOrderId}-${request.technicianId}`;

    await this.media.storeAudio(
      this.bucket,
      audioObjectKey,
      bytes,
      request.audio.contentType,
      idempotencyKey,
    );
    const transcript = await this.media.transcribe(
      request.audio.dataBase64,
      request.audio.format,
    );
    return decideWorkOrderUpdate(request, transcript, audioObjectKey);
  }
}
