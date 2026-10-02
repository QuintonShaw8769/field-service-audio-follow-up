import { createServer } from "node:http";
import { ZodError } from "zod";
import { FollowUpService } from "./follow_up_service.js";
import { InfraiMedia, InfraiRequestError } from "./infrai_media.js";
import { followUpRequestSchema } from "./work_order_decision.js";

const apiKey = process.env.INFRAI_API_KEY;
if (!apiKey) throw new Error("Set INFRAI_API_KEY before starting the service");

const bucket = process.env.INFRAI_BUCKET ?? "field-service-media";
const port = Number(process.env.PORT ?? "3000");
const service = new FollowUpService(new InfraiMedia(apiKey), bucket);

function sendJson(response: import("node:http").ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

async function readJson(request: import("node:http").IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

await service.initialize();

const server = createServer(async (request, response) => {
  if (request.method !== "POST" || request.url !== "/work-orders/follow-up") {
    sendJson(response, 404, { error: "Route not found" });
    return;
  }

  try {
    const input = followUpRequestSchema.parse(await readJson(request));
    const update = await service.process(input);
    sendJson(response, 200, update);
  } catch (error) {
    if (error instanceof ZodError) {
      sendJson(response, 400, { error: "Invalid request", issues: error.issues });
      return;
    }
    if (error instanceof SyntaxError) {
      sendJson(response, 400, { error: "Request body must be JSON" });
      return;
    }
    if (error instanceof InfraiRequestError) {
      const status = error.status >= 400 && error.status < 500 ? error.status : 502;
      sendJson(response, status, { error: error.message, code: error.code });
      return;
    }
    console.error(error);
    sendJson(response, 500, { error: "Could not process follow-up" });
  }
});

server.listen(port, () => {
  console.log(`Field-service follow-up listening on http://localhost:${port}`);
});
