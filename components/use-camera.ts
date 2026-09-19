"use client";

import { useCallback, useEffect, useEffectEvent, useRef, useState } from "react";
import type { PoseLandmarker } from "@mediapipe/tasks-vision";
import { PoseTracker } from "@/lib/tracking";
import type { Observation, Settings } from "@/lib/types";

export function useCamera(settings: Settings, onFrame: (poses: Observation[], moved: boolean, now: number) => void) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const resources = useRef<{ stream?: MediaStream; model?: PoseLandmarker; frame?: number }>({});
  const generation = useRef(0);
  const [status, setStatus] = useState<"off" | "starting" | "live" | "error">("off");
  const [error, setError] = useState("");
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [aspectRatio, setAspectRatio] = useState("16 / 9");
  const frameEvent = useEffectEvent(onFrame);
  // The animation callback is installed by the effect below, so it always sees
  // committed settings without restarting the camera for timing adjustments.
  const settingsRef = useRef(settings);
  const callbackRef = useRef(onFrame);
  useEffect(() => { settingsRef.current = settings; callbackRef.current = (...args) => frameEvent(...args); }, [settings]);

  const release = useCallback(() => {
    generation.current++;
    if (resources.current.frame !== undefined) cancelAnimationFrame(resources.current.frame);
    resources.current.stream?.getTracks().forEach(t => { t.onended = null; t.stop(); });
    resources.current.model?.close();
    resources.current = {};
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);
  useEffect(() => release, [release]);

  const stop = useCallback(() => { release(); setStatus("off"); callbackRef.current([], false, Date.now()); }, [release]);

  async function start() {
    release();
    const token = generation.current;
    setStatus("starting"); setError("");
    let pendingStream: MediaStream | undefined;
    let pendingModel: PoseLandmarker | undefined;
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("Camera access needs HTTPS or localhost and a supported browser.");
      pendingStream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { width: { ideal: 1280 }, height: { ideal: 720 }, ...(settings.cameraId ? { deviceId: { exact: settings.cameraId } } : { facingMode: "user" }) } });
      if (token !== generation.current) { pendingStream.getTracks().forEach(t => t.stop()); return; }
      resources.current.stream = pendingStream;
      const cameras = await navigator.mediaDevices.enumerateDevices();
      if (token !== generation.current) { pendingStream.getTracks().forEach(t => t.stop()); return; }
      setDevices(cameras.filter(d => d.kind === "videoinput"));
      const video = videoRef.current;
      if (!video) throw new Error("Camera preview is unavailable.");
      video.srcObject = pendingStream;
      await video.play();
      if (token !== generation.current) return;
      setAspectRatio(`${video.videoWidth} / ${video.videoHeight}`);
      const { FilesetResolver, PoseLandmarker } = await import("@mediapipe/tasks-vision");
      const fileset = await FilesetResolver.forVisionTasks(process.env.NEXT_PUBLIC_VISION_WASM_URL || "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.32/wasm");
      pendingModel = await PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: process.env.NEXT_PUBLIC_POSE_MODEL_URL || "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task", delegate: "CPU" },
        runningMode: "VIDEO", numPoses: 6,
        minPoseDetectionConfidence: 0.5, minPosePresenceConfidence: 0.5, minTrackingConfidence: 0.5,
      });
      if (token !== generation.current) { pendingModel.close(); pendingStream.getTracks().forEach(t => t.stop()); return; }
      resources.current.model = pendingModel;
      const model = pendingModel;
      const tracker = new PoseTracker();
      let lastTime = -1, lastInference = -100;
      const fail = (message: string) => { release(); setStatus("error"); setError(message); callbackRef.current([], false, Date.now()); };
      pendingStream.getVideoTracks()[0].onended = () => fail("Camera disconnected. Reconnect it and press Start camera.");
      const frame = (time: number) => {
        if (token !== generation.current) return;
        try {
          if (video.readyState >= 2 && video.currentTime !== lastTime && time - lastInference >= 80) {
            lastTime = video.currentTime; lastInference = time;
            const result = model.detectForVideo(video, time);
            const now = Date.now();
            const { observations, moved } = tracker.update(result.landmarks, now, settingsRef.current);
            callbackRef.current(observations, moved, now);
          }
          resources.current.frame = requestAnimationFrame(frame);
        } catch { fail("Pose tracking stopped. Press Start camera to reload the detector."); }
      };
      setStatus("live");
      resources.current.frame = requestAnimationFrame(frame);
    } catch (cause) {
      pendingStream?.getTracks().forEach(t => t.stop());
      if (token !== generation.current) { pendingModel?.close(); return; }
      release(); setStatus("error");
      setError(cause instanceof Error ? cause.message : "Could not start the camera or download the pose model.");
    }
  }
  return { videoRef, status, error, devices, aspectRatio, start, stop };
}
