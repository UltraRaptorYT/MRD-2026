import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";
import type { Landmark } from "@/lib/types";

type InitMessage = { type: "init"; wasmUrl: string; modelUrl: string; confidence: number };
type InferMessage = { type: "infer"; frameId: number; timestamp: number; bitmap: ImageBitmap };
type WorkerInput = InitMessage | InferMessage;
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<WorkerInput>) => void) | null;
  postMessage(message: unknown): void;
};

let landmarker: PoseLandmarker | undefined;
let activeDelegate: "GPU" | "CPU" = "CPU";

async function create(delegate: "GPU" | "CPU", message: InitMessage) {
  const fileset = await FilesetResolver.forVisionTasks(message.wasmUrl);
  const options = {
    baseOptions: {
      modelAssetPath: message.modelUrl,
      delegate,
    },
    ...(delegate === "GPU" ? { canvas: new OffscreenCanvas(1, 1) } : {}),
    runningMode: "VIDEO" as const,
    numPoses: 10,
    minPoseDetectionConfidence: message.confidence,
    minPosePresenceConfidence: message.confidence,
    minTrackingConfidence: message.confidence,
  };
  return PoseLandmarker.createFromOptions(fileset, options);
}

scope.onmessage = async ({ data }) => {
  if (data.type === "init") {
    try {
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
    const result = landmarker.detectForVideo(data.bitmap, data.timestamp);
    const landmarks: Landmark[][] = result.landmarks.map((pose) =>
      pose.map(({ x, y, visibility }) => ({ x, y, visibility })),
    );
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
