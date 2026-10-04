"use client";

import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";

export function PhotoDownloadQr({ photoId }: { photoId: string }) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setUrl("");
    setError("");
    fetch(`/api/photos/${encodeURIComponent(photoId)}/download`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not prepare photo download.");
        setUrl(data.url);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setError(reason instanceof Error ? reason.message : "Could not prepare photo download.");
        }
      });
    return () => controller.abort();
  }, [photoId]);

  if (error) return <p className="qr-error" role="status">{error}</p>;
  if (!url) return <p className="qr-hint" role="status">Preparing download QR code…</p>;

  return (
    <div className="photo-qr">
      <QRCodeSVG value={url} size={220} level="M" marginSize={2} title="Scan to download the group photo" />
      <p>Scan with a phone to download the group photo. Link expires in 1 hour.</p>
    </div>
  );
}
