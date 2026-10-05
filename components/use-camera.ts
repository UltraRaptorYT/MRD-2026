"use client";

import { useCallback, useEffect, useEffectEvent, useRef, useState } from "react";
import type { PoseLandmarker } from "@mediapipe/tasks-vision";
import { PoseTracker } from "@/lib/tracking";
import type { Landmark, Observation, Settings, TrackingDiagnostics } from "@/lib/types";

type FrameResult = { landmarks: Landmark[][]; inferenceMs: number; delegate: "GPU" | "CPU" };
type WorkerMessage =
  | { type: "ready"; delegate: "GPU" | "CPU" }
  | ({ type: "result"; frameId: number } & FrameResult)
  | { type: "error"; message: string };

const EMPTY_DIAGNOSTICS: TrackingDiagnostics = {
  rawPoses: 0,
  acceptedPoses: 0,
  inferenceMs: 0,
  delegate: "CPU",
};

export function useCamera(
  settings: Settings,
  onFrame: (poses: Observation[], moved: boolean, now: number, diagnostics: TrackingDiagnostics) => void,
) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const resources = useRef<{
    stream?: MediaStream;
    model?: PoseLandmarker;
    worker?: Worker;
    frame?: number;
  }>({});
  const generation = useRef(0);
  const [status, setStatus] = useState<"off" | "starting" | "live" | "error">("off");
  const [error, setError] = useState("");
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [aspectRatio, setAspectRatio] = useState("16 / 9");
  const frameEvent = useEffectEvent(onFrame);
  const settingsRef = useRef(settings);
  const callbackRef = useRef(onFrame);
  useEffect(() => {
    settingsRef.current = settings;
    callbackRef.current = (...args) => frameEvent(...args);
  }, [settings]);

  const release = useCallback(() => {
    generation.current++;
    if (resources.current.frame !== undefined) cancelAnimationFrame(resources.current.frame);
    resources.current.worker?.terminate();
    resources.current.stream?.getTracks().forEach((track) => {
      track.onended = null;
      track.stop();
    });
    resources.current.model?.close();
    resources.current = {};
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);
  useEffect(() => release, [release]);

  const stop = useCallback(() => {
    release();
    setStatus("off");
    callbackRef.current([], false, Date.now(), EMPTY_DIAGNOSTICS);
  }, [release]);

  async function start() {
    release();
    const startSettings = settingsRef.current;
    const token = generation.current;
    setStatus("starting");
    setError("");
    let pendingStream: MediaStream | undefined;
    let pendingModel: PoseLandmarker | undefined;
    let pendingWorker: Worker | undefined;
    try {
      if (!navigator.mediaDevices?.getUserMedia)
        throw new Error("Camera access needs HTTPS or localhost and a supported browser.");
      pendingStream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          ...(startSettings.cameraId
            ? { deviceId: { exact: startSettings.cameraId } }
            : { facingMode: "user" }),
        },
      });
      if (token !== generation.current) {
        pendingStream.getTracks().forEach((track) => track.stop());
        return;
      }
      resources.current.stream = pendingStream;
      const cameras = await navigator.mediaDevices.enumerateDevices();
      if (token !== generation.current) return;
      setDevices(cameras.filter((device) => device.kind === "videoinput"));
      const video = videoRef.current;
      if (!video) throw new Error("Camera preview is unavailable.");
      video.srcObject = pendingStream;
      await video.play();
      if (token !== generation.current) return;
      setAspectRatio(`${video.videoWidth} / ${video.videoHeight}`);

      const wasmUrl = process.env.NEXT_PUBLIC_VISION_WASM_URL ||
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.32/wasm";
      const modelUrl = process.env.NEXT_PUBLIC_POSE_MODEL_URL ||
        "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task";
      const tracker = new PoseTracker();
      let delegate: TrackingDiagnostics["delegate"] = "CPU";
      let inferencePending = false;
      let nextFrameId = 1;
      let lastFrameId = 0;
      let lastVideoTime = -1;
      let lastInferenceAt = -100;

      const updateGame = (landmarks: Landmark[][], inferenceMs: number, usedDelegate: TrackingDiagnostics["delegate"]) => {
        const now = Date.now();
        const { observations, moved, acceptedPoseCount } = tracker.update(landmarks, now, settingsRef.current);
        callbackRef.current(observations, moved, now, {
          rawPoses: landmarks.length,
          acceptedPoses: acceptedPoseCount,
          inferenceMs,
          delegate: usedDelegate,
        });
      };
      const fail = (message: string) => {
        release();
        setStatus("error");
        setError(message);
        callbackRef.current([], false, Date.now(), EMPTY_DIAGNOSTICS);
      };
      pendingStream.getVideoTracks()[0].onended = () =>
        fail("Camera disconnected. Reconnect it and press Start camera.");

      // MediaPipe runs once per calibrated player lane in a module worker.
      // Reuse one model and try GPU first; retry on CPU if GPU/WebGL fails.
      if (typeof Worker !== "undefined" && typeof createImageBitmap !== "undefined") {
        try {
          pendingWorker = new Worker(new URL("./pose-worker.ts", import.meta.url), { type: "module" });
          resources.current.worker = pendingWorker;
          await new Promise<void>((resolve, reject) => {
            const timeout = window.setTimeout(() => reject(new Error("Pose worker startup timed out.")), 30_000);
            pendingWorker!.onmessage = (event: MessageEvent<WorkerMessage>) => {
              const message = event.data;
              if (message.type === "ready") {
                window.clearTimeout(timeout);
                delegate = message.delegate;
                resolve();
              } else if (message.type === "error") {
                window.clearTimeout(timeout);
                reject(new Error(message.message));
              }
            };
            pendingWorker!.onerror = (event) => {
              window.clearTimeout(timeout);
              reject(new Error(event.message || "Pose worker failed to start."));
            };
            pendingWorker!.postMessage({
              type: "init",
              wasmUrl,
              modelUrl,
              confidence: startSettings.detectionConfidence,
              cropLeft: startSettings.floor[0].x,
              cropRight: startSettings.floor[1].x,
            });
          });
          if (token !== generation.current) return;
          pendingWorker.onmessage = (event: MessageEvent<WorkerMessage>) => {
            const message = event.data;
            if (message.type === "result" && message.frameId > lastFrameId) {
              lastFrameId = message.frameId;
              inferencePending = false;
              if (token === generation.current)
                updateGame(message.landmarks, message.inferenceMs, message.delegate);
            } else if (message.type === "error") {
              fail("Pose tracking stopped. Press Start camera to reload the detector.");
            }
          };
          pendingWorker.onerror = () => {
            if (token === generation.current)
              fail("Pose worker stopped. Press Start camera to reload the detector.");
          };
        } catch {
          pendingWorker?.terminate();
          if (resources.current.worker === pendingWorker) delete resources.current.worker;
          pendingWorker = undefined;
        }
      }
      if (token !== generation.current) return;

      // Browser fallback for worker failures, including browsers without
      // OffscreenCanvas support. Keep one full-frame inference here so a
      // fallback does not triple synchronous work on the UI thread.
      if (!pendingWorker) {
        const { FilesetResolver, PoseLandmarker } = await import("@mediapipe/tasks-vision");
        const fileset = await FilesetResolver.forVisionTasks(wasmUrl);
        pendingModel = await PoseLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: modelUrl, delegate: "CPU" },
          runningMode: "VIDEO",
          numPoses: 10,
          minPoseDetectionConfidence: startSettings.detectionConfidence,
          minPosePresenceConfidence: startSettings.detectionConfidence,
          minTrackingConfidence: startSettings.detectionConfidence,
        });
        if (token !== generation.current) {
          pendingModel.close();
          return;
        }
        delegate = "CPU";
        resources.current.model = pendingModel;
      }

      const frame = async (time: number) => {
        if (token !== generation.current) return;
        try {
          if (video.readyState >= 2 && video.currentTime !== lastVideoTime && time - lastInferenceAt >= 80 && !inferencePending) {
            lastVideoTime = video.currentTime;
            lastInferenceAt = time;
            if (pendingWorker) {
              inferencePending = true;
              const frameId = nextFrameId++;
              const bitmap = await createImageBitmap(video);
              if (token !== generation.current) {
                bitmap.close();
                return;
              }
              pendingWorker.postMessage({ type: "infer", frameId, bitmap }, [bitmap]);
            } else if (pendingModel) {
              const started = performance.now();
              const result = pendingModel.detectForVideo(video, time);
              updateGame(result.landmarks.map((pose) => pose.map(({ x, y, visibility }) => ({ x, y, visibility }))), performance.now() - started, delegate);
            }
          }
          resources.current.frame = requestAnimationFrame((nextTime) => void frame(nextTime));
        } catch {
          inferencePending = false;
          fail("Pose tracking stopped. Press Start camera to reload the detector.");
        }
      };
      setStatus("live");
      resources.current.frame = requestAnimationFrame((time) => void frame(time));
    } catch (cause) {
      pendingWorker?.terminate();
      pendingStream?.getTracks().forEach((track) => track.stop());
      if (token !== generation.current) {
        pendingModel?.close();
        return;
      }
      release();
      setStatus("error");
      setError(cause instanceof Error ? cause.message : "Could not start the camera or download the pose model.");
    }
  }
  return { videoRef, status, error, devices, aspectRatio, start, stop };
}
