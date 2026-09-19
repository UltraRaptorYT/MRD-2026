export interface SavedPhoto { id: string; blob: Blob; createdAt: number }

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
  const response = await fetch("/api/photos", { method: "POST", headers: { "Content-Type": "image/jpeg", "X-Session-Id": photo.id }, body: photo.blob, signal: AbortSignal.timeout(20000) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Cloud upload failed.");
  return data.path;
}

export function capturePhoto(video: HTMLVideoElement, mirror: boolean): Promise<Blob> {
  if (video.readyState < 2 || !video.videoWidth || !video.srcObject) return Promise.reject(new Error("No live camera frame. Reconnect the camera, then retake the photo."));
  const canvas = document.createElement("canvas");
  canvas.width = Math.min(1280, video.videoWidth);
  canvas.height = Math.round(canvas.width * video.videoHeight / video.videoWidth);
  const context = canvas.getContext("2d");
  if (!context) return Promise.reject(new Error("Photo capture is unavailable."));
  if (mirror) { context.translate(canvas.width, 0); context.scale(-1, 1); }
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Photo capture failed.")), "image/jpeg", 0.9));
}
