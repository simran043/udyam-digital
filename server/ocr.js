// Local OCR using tesseract.js. Images are processed in memory and never
// written to disk, so the server keeps no copy of uploaded KYC documents.
import { createWorker } from "tesseract.js";

let workerPromise = null;
let queue = Promise.resolve();

function getWorker() {
  if (!workerPromise) {
    workerPromise = createWorker("eng").catch((err) => {
      workerPromise = null;
      throw err;
    });
  }
  return workerPromise;
}

// One worker, so requests are serialised to keep memory use predictable.
export function recognize(imageBuffer) {
  const job = queue.then(async () => {
    const worker = await getWorker();
    const { data } = await worker.recognize(imageBuffer);
    return { text: data.text, confidence: data.confidence };
  });
  queue = job.catch(() => {});
  return job;
}

export async function shutdownOcr() {
  if (workerPromise) {
    const worker = await workerPromise;
    await worker.terminate();
    workerPromise = null;
  }
}
