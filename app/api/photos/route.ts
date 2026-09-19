export const runtime = "nodejs";
const MAX_BYTES = 3 * 1024 * 1024;

export async function GET() {
  return Response.json({ configured: !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.SUPABASE_PHOTO_BUCKET) });
}

export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return Response.json({ error: "Same-origin uploads only." }, { status: 403 });
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bucket = process.env.SUPABASE_PHOTO_BUCKET;
  if (!url || !key || !bucket) return Response.json({ error: "Cloud storage is not configured. Use the local photo copy." }, { status: 503 });
  const id = request.headers.get("x-session-id") ?? "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) || request.headers.get("content-type") !== "image/jpeg") return Response.json({ error: "Invalid photo request." }, { status: 400 });
  if (Number(request.headers.get("content-length")) > MAX_BYTES) return Response.json({ error: "Photo is too large." }, { status: 413 });
  try {
    const reader = request.body?.getReader();
    if (!reader) return Response.json({ error: "Photo is missing." }, { status: 400 });
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_BYTES) { await reader.cancel(); return Response.json({ error: "Photo is too large." }, { status: 413 }); }
      chunks.push(value);
    }
    const image = Buffer.concat(chunks);
    if (image.length < 4 || image[0] !== 0xff || image[1] !== 0xd8 || image[2] !== 0xff || image.at(-2) !== 0xff || image.at(-1) !== 0xd9) return Response.json({ error: "Invalid JPEG photo." }, { status: 400 });
    const path = `groups/${id}.jpg`;
    const result = await fetch(`${url.replace(/\/$/, "")}/storage/v1/object/${encodeURIComponent(bucket)}/${path}`, {
      method: "POST", headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "image/jpeg", "x-upsert": "true" },
      body: image, signal: AbortSignal.timeout(15000),
    });
    if (!result.ok) return Response.json({ error: "Supabase could not save the photo. Check the bucket and server credentials, then retry." }, { status: 502 });
    return Response.json({ path: `${bucket}/${path}` });
  } catch { return Response.json({ error: "Photo upload failed. Your local copy can be retried." }, { status: 502 }); }
}
