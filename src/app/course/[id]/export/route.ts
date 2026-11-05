import { connection } from "next/server";
import { exportCourse } from "@/lib/bundle";
import { currentUserId } from "@/lib/settings";

/** Downloads a finished course as a .kustom file. */
export async function GET(_req: Request, { params }: RouteContext<"/course/[id]/export">) {
  await connection();
  const { id } = await params;
  const bundle = /^[0-9a-f-]{36}$/.test(id) ? await exportCourse(id, currentUserId()) : null;
  if (!bundle) return new Response("Not found", { status: 404 });
  const name = bundle.course.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "course";
  return new Response(JSON.stringify(bundle), {
    headers: { "content-type": "application/json; charset=utf-8", "content-disposition": `attachment; filename="${name}.kustom"`, "cache-control": "no-store" },
  });
}
