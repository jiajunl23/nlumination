import "server-only";
import { auth, currentUser } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";

/**
 * Resolve the signed-in Clerk user to a row in our `users` table,
 * creating it on the fly if the Clerk webhook hasn't fired yet.
 *
 * Returns the userId (Clerk's user_xxx). Throws if not authenticated.
 */
export async function requireDbUser(): Promise<string> {
  const { userId } = await auth();
  if (!userId) throw new UnauthorizedError();

  // Hot path: try to find an existing row.
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (existing.length > 0) return userId;

  // Cold path: pull email from Clerk and insert.
  const clerkUser = await currentUser();
  const email = clerkUser?.primaryEmailAddress?.emailAddress ?? null;
  await db.insert(users).values({ id: userId, email }).onConflictDoNothing();
  return userId;
}

export class UnauthorizedError extends Error {
  status = 401;
  constructor() {
    super("Not signed in");
    this.name = "UnauthorizedError";
  }
}
