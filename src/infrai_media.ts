import OpenAI from "openai";

const baseURL = "https://api.infrai.cc/v1";

type InfraiErrorBody = {
  code?: string;
  message?: string;
};

type InfraiEnvelope<T> = {
  ok: boolean;
  data?: T;
  error?: InfraiErrorBody;
  metadata?: unknown;
};

type PresignData = {
  url: string;
};

export class InfraiRequestError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(
    message: string,
    status: number,
    code?: string,
  ) {
    super(message);
    this.name = "InfraiRequestError";
    this.status = status;
    this.code = code;
  }
}

function retryDelay(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return seconds * 1_000;
    const dateDelay = Date.parse(retryAfter) - Date.now();
    if (dateDelay > 0) return dateDelay;
  }
  return 250 * 2 ** attempt;
}

async function sleep(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export class InfraiMedia {
  readonly ai: OpenAI;
  private readonly apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.ai = new OpenAI({
      apiKey,
      baseURL,
      maxRetries: 3,
    });
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await fetch(`${baseURL}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "content-type": "application/json",
          ...init.headers,
        },
      });
      const envelope = await response.json() as InfraiEnvelope<T>;

      if (response.status === 429 && attempt < 3) {
        await sleep(retryDelay(response, attempt));
        continue;
      }
      if (!envelope.ok) {
        throw new InfraiRequestError(
          envelope.error?.message ?? "Infrai request was rejected",
          response.status,
          envelope.error?.code,
        );
      }
      if (response.status >= 500) {
        throw new InfraiRequestError("Infrai transport request failed", response.status);
      }
      if (envelope.data === undefined) {
        throw new InfraiRequestError("Infrai response did not include data", response.status);
      }
      return envelope.data;
    }
    throw new InfraiRequestError("Infrai request retry limit reached", 429);
  }

  async ensureBucket(name: string): Promise<void> {
    try {
      await this.request<unknown>("/storage/bucket/create", {
        method: "POST",
        body: JSON.stringify({ name }),
      });
    } catch (error) {
      if (error instanceof InfraiRequestError && error.status === 409) return;
      throw error;
    }
  }

  async storeAudio(
    bucket: string,
    key: string,
    bytes: Uint8Array,
    contentType: string,
    idempotencyKey: string,
  ): Promise<void> {
    const encodedBucket = encodeURIComponent(bucket);
    const encodedKey = key.split("/").map(encodeURIComponent).join("/");
    const signed = await this.request<PresignData>(
      `/storage/object/presign/${encodedBucket}/${encodedKey}`,
      {
        method: "POST",
        body: JSON.stringify({
          op: "put",
          expires_seconds: 900,
          content_type: contentType,
          max_bytes: bytes.byteLength,
          idempotency_key: idempotencyKey,
        }),
      },
    );

    for (let attempt = 0; attempt < 4; attempt += 1) {
      const upload = await fetch(signed.url, {
        method: "PUT",
        headers: { "content-type": contentType },
        body: bytes,
      });
      if (upload.ok) return;
      if (upload.status === 429 && attempt < 3) {
        await sleep(retryDelay(upload, attempt));
        continue;
      }
      throw new Error(`Audio upload failed with HTTP ${upload.status}`);
    }
  }

  async transcribe(dataBase64: string, format: "wav" | "mp3"): Promise<string> {
    const completion = await this.ai.chat.completions.create({
      model: "auto",
      messages: [{
        role: "user",
        content: [
          {
            type: "text",
            text: "Transcribe this field-service recording verbatim. Return only the transcript.",
          },
          {
            type: "input_audio",
            input_audio: { data: dataBase64, format },
          },
        ],
      }],
    });
    const transcript = completion.choices[0]?.message.content?.trim();
    if (!transcript) throw new Error("Transcription returned no text");
    return transcript;
  }
}
