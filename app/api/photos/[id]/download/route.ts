import { createSupabaseStorageClient, getSupabaseStorageConfig } from "@/lib/supabase-storage";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return Response.json({ error: "Invalid photo ID." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  const { url, secretKey, bucket } = getSupabaseStorageConfig();
  if (!url || !secretKey || !bucket) {
    return Response.json({ error: "Cloud photo storage is not configured." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }

  try {
    const supabase = createSupabaseStorageClient(url, secretKey);
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(
      `groups/${id}.jpg`,
      60 * 60,
      { download: "group-photo.jpg" },
    );
    if (error) return Response.json({ error: "Could not prepare the photo download." }, { status: 404, headers: { "Cache-Control": "no-store" } });
    return Response.json({ url: data.signedUrl, expiresIn: 60 * 60 }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Could not prepare the photo download." }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
