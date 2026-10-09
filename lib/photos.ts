export interface SavedPhoto { id: string; blob: Blob; createdAt: number }

let watermarkImage: Promise<HTMLImageElement> | undefined;

function loadWatermarkImage(): Promise<HTMLImageElement> {
  watermarkImage ??= new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("The photo watermark could not be loaded."));
    image.src = "/BWM%20Logo.png";
  });
  return watermarkImage;
}

function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("mrd-group-photos", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("photos", { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveLocalPhoto(photo: SavedPhoto) {
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("photos", "readwrite");
      tx.objectStore("photos").put(photo);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally { db.close(); }
}

export async function listLocalPhotos(): Promise<SavedPhoto[]> {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction("photos").objectStore("photos").getAll();
      request.onsuccess = () => resolve((request.result as SavedPhoto[]).sort((a, b) => b.createdAt - a.createdAt));
      request.onerror = () => reject(request.error);
    });
  } finally { db.close(); }
}

export async function uploadPhoto(photo: SavedPhoto): Promise<string> {
  const response = await fetch("/api/photos", { method: "POST", headers: { "Content-Type": "image/jpeg", "X-Session-Id": photo.id, "X-Photo-Created-At": String(photo.createdAt) }, body: photo.blob, signal: AbortSignal.timeout(20000) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Cloud upload failed.");
  return data.path;
}

export async function capturePhoto(video: HTMLVideoElement, mirror: boolean): Promise<Blob> {
  if (video.readyState < 2 || !video.videoWidth || !video.srcObject) return Promise.reject(new Error("No live camera frame. Reconnect the camera, then retake the photo."));
  const canvas = document.createElement("canvas");
  canvas.width = Math.min(1280, video.videoWidth);
  canvas.height = Math.round(canvas.width * video.videoHeight / video.videoWidth);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Photo capture is unavailable.");
  context.save();
  if (mirror) { context.translate(canvas.width, 0); context.scale(-1, 1); }
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  context.restore();

  const logo = await loadWatermarkImage();
  const margin = Math.round(canvas.width * 0.018);
  const barHeight = Math.min(canvas.height - margin * 2, Math.max(44, Math.round(canvas.width * 0.09)));
  const barWidth = Math.min(canvas.width - margin * 2, Math.round(canvas.width * 0.72));
  const padding = Math.round(barHeight * 0.16);
  const logoSize = barHeight - padding * 2;
  const gap = Math.round(barHeight * 0.16);
  const barX = Math.round((canvas.width - barWidth) / 2);
  const barY = canvas.height - barHeight - margin;

  context.save();
  context.fillStyle = "rgba(246, 241, 223, 0.94)";
  context.beginPath();
  context.roundRect(barX, barY, barWidth, barHeight, Math.round(barHeight * 0.18));
  context.fill();

  context.globalAlpha = 0.98;
  context.drawImage(logo, barX + padding, barY + padding, logoSize, logoSize);

  const dividerX = barX + padding + logoSize + Math.round(gap * 0.55);
  context.fillStyle = "#53b995";
  context.fillRect(dividerX, barY + padding, Math.max(2, Math.round(barHeight * 0.025)), logoSize);

  const textX = dividerX + gap;
  const textWidth = barX + barWidth - padding - textX;
  const eventFontSize = Math.max(12, Math.min(Math.round(barHeight * 0.19), Math.round(textWidth * 0.055)));
  const mottoFontSize = Math.max(10, Math.min(Math.round(barHeight * 0.16), Math.round(textWidth * 0.05)));
  const englishFontSize = Math.max(9, Math.min(Math.round(barHeight * 0.13), Math.round(textWidth * 0.027)));
  context.textAlign = "left";
  context.textBaseline = "middle";
  context.fillStyle = "#081a17";
  context.font = `800 ${eventFontSize}px Arial, sans-serif`;
  context.fillText("MRD 2026 亿师恩法会 2026", textX, barY + barHeight * 0.22, textWidth);
  context.fillStyle = "#28745a";
  context.font = `700 ${mottoFontSize}px Arial, sans-serif`;
  context.fillText("春风化雨润桃季 师长功德你知几", textX, barY + barHeight * 0.49, textWidth);
  context.fillStyle = "#081a17";
  context.font = `600 ${englishFontSize}px Arial, sans-serif`;
  context.fillText("Trivia Challenge: How well do you know our excellent teachers?", textX, barY + barHeight * 0.77, textWidth);
  context.restore();

  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Photo capture failed.")), "image/jpeg", 0.9));
}
