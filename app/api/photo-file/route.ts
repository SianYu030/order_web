import { agentAuthorized, photoStore } from "../../../lib/photo-temp-store";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!(await agentAuthorized(request))) {
    return new Response("Unauthorized", { status: 401 });
  }

  const id = new URL(request.url).searchParams.get("id") || "";
  if (!/^[0-9a-f-]{30,40}$/i.test(id)) {
    return new Response("Bad id", { status: 400 });
  }

  const store = photoStore();
  const entry = await store.getWithMetadata(`files/${id}`, { type: "arrayBuffer" });
  if (!entry || !entry.data) {
    return new Response("Not found", { status: 404 });
  }

  const meta = (entry.metadata || {}) as { contentType?: string; fileName?: string };
  return new Response(entry.data as ArrayBuffer, {
    status: 200,
    headers: {
      "Content-Type": meta.contentType || "application/octet-stream",
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(meta.fileName || "photo")}`,
      "Cache-Control": "no-store",
    },
  });
}
