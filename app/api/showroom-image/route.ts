import { getHdShowroomImageSrc } from "../../../lib/reference-showroom-hd";

export const dynamic = "force-dynamic";

export async function GET() {
  const source = getHdShowroomImageSrc();
  const prefix = "data:image/webp;base64,";

  if (!source.startsWith(prefix)) {
    return new Response("Invalid showroom image", { status: 500 });
  }

  const bytes = Buffer.from(source.slice(prefix.length), "base64");

  return new Response(bytes, {
    status: 200,
    headers: {
      "Content-Type": "image/webp",
      "Content-Length": String(bytes.length),
      "Cache-Control": "public, max-age=3600, s-maxage=86400"
    }
  });
}
