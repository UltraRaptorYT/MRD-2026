import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";
import type { Landmark } from "@/lib/types";

type InitMessage = { type: "init"; wasmUrl: string; modelUrl: string; confidence: number; cropLeft: number; cropRight: number };
type InferMessage = { type: "infer"; frameId: number; bitmap: ImageBitmap };
type WorkerInput = InitMessage | InferMessage;
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<WorkerInput>) => void) | null;
  postMessage(message: unknown): void;
};

let landmarker: PoseLandmarker | undefined;
let activeDelegate: "GPU" | "CPU" = "CPU";
let cropLeft = 0.1;
let cropRight = 0.9;

async function create(delegate: "GPU" | "CPU", message: InitMessage) {
  const fileset = await FilesetResolver.forVisionTasks(message.wasmUrl);
  const options = {
    baseOptions: {
      modelAssetPath: message.modelUrl,
      delegate,
    },
    ...(delegate === "GPU" ? { canvas: new OffscreenCanvas(1, 1) } : {}),
    runningMode: "IMAGE" as const,
    numPoses: 1,
    minPoseDetectionConfidence: message.confidence,
    minPosePresenceConfidence: message.confidence,
    minTrackingConfidence: message.confidence,
  };
  return PoseLandmarker.createFromOptions(fileset, options);
}

scope.onmessage = async ({ data }) => {
  if (data.type === "init") {
    try {
      cropLeft = Math.max(0, Math.min(1, data.cropLeft));
      cropRight = Math.max(cropLeft, Math.min(1, data.cropRight));
      if (typeof OffscreenCanvas !== "undefined") {
        try {
          landmarker = await create("GPU", data);
          activeDelegate = "GPU";
        } catch {
          landmarker?.close();
          landmarker = undefined;
        }
      }
      if (!landmarker) {
        landmarker = await create("CPU", data);
        activeDelegate = "CPU";
      }
      scope.postMessage({ type: "ready", delegate: activeDelegate });
    } catch (cause) {
      scope.postMessage({
        type: "error",
        message: cause instanceof Error ? cause.message : "Could not initialize MediaPipe in a worker.",
      });
    }
    return;
  }

  try {
    if (!landmarker) throw new Error("Pose worker is not initialized.");
    const started = performance.now();
    const width = data.bitmap.width;
    const height = data.bitmap.height;
    const laneWidth = (cropRight - cropLeft) / 3;
    const landmarks: Landmark[][] = [];
    for (let lane = 0; lane < 3; lane++) {
      const left = Math.round((cropLeft + lane * laneWidth) * width);
      const right = Math.round((cropLeft + (lane + 1) * laneWidth) * width);
      const crop = await createImageBitmap(data.bitmap, left, 0, right - left, height);
      try {
        const result = landmarker.detect(crop);
        for (const pose of result.landmarks) {
          landmarks.push(pose.map(({ x, y, visibility }) => ({
            x: (left + x * (right - left)) / width,
            y,
            visibility,
          })));
        }
      } finally {
        crop.close();
      }
    }
    scope.postMessage({
      type: "result",
      frameId: data.frameId,
      landmarks,
      inferenceMs: performance.now() - started,
      delegate: activeDelegate,
    });
  } catch (cause) {
    scope.postMessage({
      type: "error",
      message: cause instanceof Error ? cause.message : "Pose inference failed.",
    });
  } finally {
    data.bitmap.close();
  }
};
