import { NextResponse } from "next/server";
import { requireDbUser, UnauthorizedError } from "@/lib/auth/current-user";
import { signUpload } from "@/lib/storage/sign";

export async function POST() {
  try {
    const userId = await requireDbUser();
    const presigned = signUpload({ userId });
    return NextResponse.json(presigned);
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
