import { NextResponse } from "next/server";
import { getStudentSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getStudentSession();
  if (!session) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const { id } = await params;
  const material = await prisma.learningMaterial.findFirst({
    where: { id, course: { students: { some: { id: session.sub, status: "active" } } } },
    select: { fileName: true, mimeType: true, data: true },
  });
  if (!material) return NextResponse.json({ error: "Material not found" }, { status: 404 });

  const body = material.data.buffer.slice(
    material.data.byteOffset,
    material.data.byteOffset + material.data.byteLength
  ) as ArrayBuffer;

  const url     = new URL(request.url);
  const isInline = url.searchParams.get("view") === "inline";
  const safeName = material.fileName.replace(/[\\"\r\n]/g, "_");

  // When view=inline (live classroom presentation):
  //   • Force Content-Disposition: inline — browser renders, no download prompt
  //   • Add X-Content-Type-Options: nosniff
  //   • Do NOT include a filename that triggers browser save dialogs
  // When NOT inline (normal material access):
  //   • Serve as attachment so the browser downloads it
  return new NextResponse(body, {
    headers: {
      "Content-Type": material.mimeType,
      "Content-Disposition": isInline
        ? "inline"                                          // no filename = no save dialog
        : `attachment; filename="${safeName}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      // Allow embedding in same-origin iframes (overrides global X-Frame-Options: DENY)
      "X-Frame-Options": "SAMEORIGIN",
    },
  });
}
