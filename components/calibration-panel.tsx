"use client";

import { ChangeEvent, PointerEvent, useEffect, useRef, useState } from "react";
import { CALIBRATION_STORAGE_KEY, defaultCalibration } from "@/lib/calibration";
import type { Calibration, CalibrationZone } from "@/lib/types";

const zoneOrder: CalibrationZone[] = ["PLAYER", "READY", "A", "B", "C"];
const colours: Record<CalibrationZone, string> = {
  PLAYER: "#f6f0dc", READY: "#47efb5", A: "#ff695e", B: "#ffd34d", C: "#63a4ff",
};

export function CalibrationPanel() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraState, setCameraState] = useState<"off" | "starting" | "live" | "error">("off");
  const [selectedZone, setSelectedZone] = useState<CalibrationZone>("PLAYER");
  const [calibration, setCalibration] = useState<Calibration>(defaultCalibration);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const loadFrame = window.requestAnimationFrame(() => {
      try {
        const stored = localStorage.getItem(CALIBRATION_STORAGE_KEY);
        if (stored) setCalibration(JSON.parse(stored) as Calibration);
      } catch { /* retain safe defaults */ }
    });
    return () => {
      window.cancelAnimationFrame(loadFrame);
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  async function startCamera() {
    setCameraState("starting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "environment" }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraState("live");
    } catch {
      setCameraState("error");
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraState("off");
  }

  function addPoint(event: PointerEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const point = { x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height };
    setCalibration((current) => ({ ...current, [selectedZone]: current[selectedZone].length >= 4 ? [point] : [...current[selectedZone], point] }));
    setSaved(false);
  }

  function saveCalibration() {
    localStorage.setItem(CALIBRATION_STORAGE_KEY, JSON.stringify(calibration));
    setSaved(true);
  }

  function exportCalibration() {
    const blob = new Blob([JSON.stringify(calibration, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "mrd-quiz-calibration.json";
    link.click();
    URL.revokeObjectURL(link.href);
  }

  function importCalibration(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const next = JSON.parse(String(reader.result)) as Calibration;
        if (zoneOrder.every((zone) => Array.isArray(next[zone]))) {
          setCalibration(next);
          setSaved(false);
        }
      } catch { /* invalid imports are ignored */ }
    };
    reader.readAsText(file);
  }

  return (
    <section className="operator-panel camera-panel">
      <div className="panel-heading">
        <div><span className="section-number">01</span><div><h2>Camera & calibration</h2><p>Click four corners for the selected floor area.</p></div></div>
        <span className={`status-pill status-${cameraState}`}><i />{cameraState}</span>
      </div>

      <div className="camera-stage">
        <video ref={videoRef} muted playsInline />
        {cameraState !== "live" && (
          <div className="camera-placeholder"><span>CAMERA PREVIEW</span><strong>{cameraState === "error" ? "Camera unavailable" : "Start the camera to calibrate"}</strong><small>The simulator can run without camera access.</small></div>
        )}
        <svg className="calibration-overlay" viewBox="0 0 1000 562.5" preserveAspectRatio="none" onPointerDown={addPoint} role="application" aria-label="Floor zone calibration canvas">
          {zoneOrder.map((zone) => {
            const points = calibration[zone];
            const value = points.map((point) => `${point.x * 1000},${point.y * 562.5}`).join(" ");
            return (
              <g key={zone}>
                {points.length >= 3 && <polygon points={value} fill={colours[zone]} fillOpacity={selectedZone === zone ? 0.23 : 0.1} stroke={colours[zone]} strokeWidth={selectedZone === zone ? 4 : 2} strokeDasharray={zone === "PLAYER" ? "12 8" : undefined} />}
                {points.map((point, index) => <circle key={index} cx={point.x * 1000} cy={point.y * 562.5} r={selectedZone === zone ? 8 : 5} fill={colours[zone]} />)}
                {points.length >= 3 && <text x={points.reduce((sum, point) => sum + point.x, 0) / points.length * 1000} y={points.reduce((sum, point) => sum + point.y, 0) / points.length * 562.5} fill={colours[zone]} textAnchor="middle" fontSize="24" fontWeight="800">{zone}</text>}
              </g>
            );
          })}
        </svg>
        <div className="camera-badge">SIMULATED DETECTOR</div>
      </div>

      <div className="calibration-toolbar">
        <div className="zone-tabs">
          {zoneOrder.map((zone) => <button type="button" className={selectedZone === zone ? "active" : ""} key={zone} onClick={() => setSelectedZone(zone)}>{zone}</button>)}
        </div>
        <button className="text-button" type="button" onClick={() => { setCalibration((current) => ({ ...current, [selectedZone]: [] })); setSaved(false); }}>Reset {selectedZone}</button>
      </div>
      <div className="panel-actions">
        {cameraState === "live" ? <button className="button button-secondary" type="button" onClick={stopCamera}>Stop camera</button> : <button className="button button-secondary" type="button" onClick={startCamera}>Start camera</button>}
        <button className="button button-primary" type="button" onClick={saveCalibration}>{saved ? "Saved ✓" : "Save calibration"}</button>
        <button className="text-button" type="button" onClick={exportCalibration}>Export</button>
        <label className="text-button file-button">Import<input type="file" accept="application/json" onChange={importCalibration} /></label>
      </div>
    </section>
  );
}
