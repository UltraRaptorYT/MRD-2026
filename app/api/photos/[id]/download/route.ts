import { createSupabaseStorageClient, getSupabaseStorageConfig } from "@/lib/supabase-storage";
import { photoDownloadFilename } from "@/lib/photo-name";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return Response.json({ error: "Invalid photo ID." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  const { url, secretKey, bucket } = getSupabaseStorageConfig();
  if (!url || !secretKey || !bucket) {
    return Response.json({ error: "Cloud photo storage is not configured." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }

  const rawCreatedAt = new URL(request.url).searchParams.get("createdAt");
  const createdAt = rawCreatedAt === null ? null : Number(rawCreatedAt);
  if (createdAt !== null && (!Number.isSafeInteger(createdAt) || createdAt <= 0 || !Number.isFinite(new Date(createdAt).getTime()))) {
    return Response.json({ error: "Invalid photo timestamp." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  try {
    const supabase = createSupabaseStorageClient(url, secretKey);
    const objectPaths = createdAt === null
      ? [`groups/${id}.jpg`]
      : [`groups/${id}_${createdAt}.jpg`, `groups/${id}.jpg`];
    let data: { signedUrl: string } | null = null;
    for (const objectPath of objectPaths) {
      const result = await supabase.storage.from(bucket).createSignedUrl(
        objectPath,
        60 * 60,
        { download: createdAt === null ? `mrd-group-photo_${id.slice(0, 8)}.jpg` : photoDownloadFilename(createdAt, id) },
      );
      if (!result.error) {
        data = result.data;
        break;
      }
    }
    if (!data) return Response.json({ error: "Could not prepare the photo download." }, { status: 404, headers: { "Cache-Control": "no-store" } });
    return Response.json({ url: data.signedUrl, expiresIn: 60 * 60 }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Could not prepare the photo download." }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
