import { AwsClient } from "aws4fetch";

export const runtime = "nodejs";
const MAX_BYTES = 3 * 1024 * 1024;

function storageConfig() {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_PHOTO_BUCKET;
  return { accountId, accessKeyId, secretAccessKey, bucket };
}

export async function GET() {
  const config = storageConfig();
  return Response.json({ configured: Object.values(config).every(Boolean) });
}

export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return Response.json({ error: "Same-origin uploads only." }, { status: 403 });
  const { accountId, accessKeyId, secretAccessKey, bucket } = storageConfig();
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) return Response.json({ error: "Cloud storage is not configured. Use the local photo copy." }, { status: 503 });
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
    const client = new AwsClient({ service: "s3", region: "auto", accessKeyId, secretAccessKey });
    const objectUrl = `https://${accountId}.r2.cloudflarestorage.com/${encodeURIComponent(bucket)}/${path}`;
    const result = await client.fetch(objectUrl, {
      method: "PUT", headers: { "Content-Type": "image/jpeg" }, body: image, signal: AbortSignal.timeout(15000),
    });
    if (!result.ok) return Response.json({ error: "Cloudflare R2 could not save the photo. Check the bucket and API credentials, then retry." }, { status: 502 });
    return Response.json({ path: `${bucket}/${path}` });
  } catch { return Response.json({ error: "Photo upload failed. Your local copy can be retried." }, { status: 502 }); }
}
