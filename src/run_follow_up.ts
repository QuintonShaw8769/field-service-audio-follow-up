import { readFile } from "node:fs/promises";

const audioPath = process.argv[2];
if (!audioPath) {
  throw new Error("Run: npm run demo -- ./recording.wav");
}

const audio = await readFile(audioPath);
const response = await fetch("http://localhost:3000/work-orders/follow-up", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    workOrderId: "WO-1842",
    technicianId: "tech-27",
    dispatchStatus: "completed",
    audio: {
      dataBase64: audio.toString("base64"),
      format: "wav",
      contentType: "audio/wav",
    },
    photos: [{
      url: "https://media.example.com/work-orders/WO-1842/panel.jpg",
      caption: "Panel after inspection",
    }],
  }),
});

const result = await response.json();
console.log(JSON.stringify(result, null, 2));
if (!response.ok) process.exitCode = 1;
