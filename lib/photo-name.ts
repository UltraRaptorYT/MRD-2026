export function photoDownloadFilename(createdAt: number, id: string): string {
  const date = new Date(createdAt);
  const timestamp = Number.isFinite(date.getTime())
    ? `${date.toISOString().slice(0, 19).replace("T", "_").replaceAll(":", "-")}-${date.toISOString().slice(20, 23)}Z`
    : "unknown-time";
  return `mrd-group-photo_${timestamp}_${id.slice(0, 8)}.jpg`;
}
