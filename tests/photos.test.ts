import assert from "node:assert/strict";
import test from "node:test";
import { GET, POST } from "../app/api/photos/route";

test("photo API validates origin, configuration, size, JPEG, and cloud failures", async () => {
  const original = {
    accountId: process.env.R2_ACCOUNT_ID,
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    bucket: process.env.R2_PHOTO_BUCKET,
    fetch: globalThis.fetch,
  };
  const request = (body: Uint8Array | string, extra: Record<string, string> = {}) => new Request("https://quiz.example/api/photos", { method: "POST", headers: { origin: "https://quiz.example", "content-type": "image/jpeg", "x-session-id": "12345678-1234-4234-8234-123456789abc", ...extra }, body: body as BodyInit });
  try {
    delete process.env.R2_ACCOUNT_ID;
    assert.equal((await POST(request("hello", { origin: "https://other.example" }))).status, 403);
    assert.equal((await POST(request("hello"))).status, 503);
    assert.equal((await (await GET()).json()).configured, false);
    process.env.R2_ACCOUNT_ID = "test-account";
    process.env.R2_ACCESS_KEY_ID = "test-access-key";
    process.env.R2_SECRET_ACCESS_KEY = "test-secret-key";
    process.env.R2_PHOTO_BUCKET = "photos";
    assert.equal((await POST(request("hello", { "x-session-id": "../escape" }))).status, 400);
    assert.equal((await POST(request("hello"))).status, 400);
    assert.equal((await POST(request(new Uint8Array(3 * 1024 * 1024 + 1)))).status, 413);
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 0xff, 0xd9]);
    globalThis.fetch = async (input, init) => {
      const signed = input instanceof Request ? input : new Request(input, init);
      assert.equal(signed.url, "https://test-account.r2.cloudflarestorage.com/photos/groups/12345678-1234-4234-8234-123456789abc.jpg");
      assert.equal(signed.method, "PUT");
      assert.match(signed.headers.get("authorization") ?? "", /^AWS4-HMAC-SHA256 /);
      assert.equal(signed.headers.get("content-type"), "image/jpeg");
      return Response.json({ Key: "saved" });
    };
    const success = await POST(request(jpeg));
    assert.equal(success.status, 200);
    assert.equal((await success.json()).path, "photos/groups/12345678-1234-4234-8234-123456789abc.jpg");
    globalThis.fetch = async () => new Response("secret provider failure", { status: 403 });
    const failure = await POST(request(jpeg));
    assert.equal(failure.status, 502);
    assert.ok(!(await failure.text()).includes("secret provider failure"));
  } finally {
    for (const [key, value] of [["R2_ACCOUNT_ID", original.accountId], ["R2_ACCESS_KEY_ID", original.accessKeyId], ["R2_SECRET_ACCESS_KEY", original.secretAccessKey], ["R2_PHOTO_BUCKET", original.bucket]]) {
      if (value === undefined) delete process.env[key!]; else process.env[key!] = value;
    }
    globalThis.fetch = original.fetch;
  }
});
