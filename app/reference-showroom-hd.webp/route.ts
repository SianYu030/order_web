import chunk00 from "@/lib/reference-showroom-image/chunk-00";
import chunk01 from "@/lib/reference-showroom-image/chunk-01";
import chunk02 from "@/lib/reference-showroom-image/chunk-02";
import chunk03 from "@/lib/reference-showroom-image/chunk-03";
import chunk04 from "@/lib/reference-showroom-image/chunk-04";
import chunk05 from "@/lib/reference-showroom-image/chunk-05";

export const runtime = "nodejs";
export const dynamic = "force-static";

const SHOWROOM_IMAGE_BASE64 = [chunk00, chunk01, chunk02, chunk03, chunk04, chunk05].join("");

export async function GET(): Promise<Response> {
  const image = Buffer.from(SHOWROOM_IMAGE_BASE64, "base64");

  return new Response(image, {
    status: 200,
    headers: {
      "Content-Type": "image/webp",
      "Content-Length": String(image.byteLength),
      "Cache-Control": "public, max-age=31536000, immutable"
    }
  });
}
