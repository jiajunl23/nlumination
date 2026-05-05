import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { userPresets } from "@/lib/db/schema";
import { requireDbUser, UnauthorizedError } from "@/lib/auth/current-user";

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await requireDbUser();
    const { id } = await ctx.params;

    const result = await db
      .delete(userPresets)
      .where(and(eq(userPresets.id, id), eq(userPresets.userId, userId)))
      .returning({ id: userPresets.id });
    if (result.length === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    console.error("/api/presets/[id] DELETE", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
