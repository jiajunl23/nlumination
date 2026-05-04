import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { llmUsage } from "@/lib/db/schema";
import { DAILY_LLM_LIMIT } from "./modes";

// Re-exported so existing callers (route.ts) keep working without churn
// while we migrate. modes.ts is the source of truth.
export { DAILY_LLM_LIMIT };

const utcDay = (): string => new Date().toISOString().slice(0, 10);

export async function getRemaining(userId: string): Promise<number> {
  const [row] = await db
    .select({ count: llmUsage.count })
    .from(llmUsage)
    .where(and(eq(llmUsage.userId, userId), eq(llmUsage.day, utcDay())))
    .limit(1);
  const used = row?.count ?? 0;
  return Math.max(0, DAILY_LLM_LIMIT - used);
}

/**
 * Atomic upsert + increment of today's call count for `userId`.
 *
 * `by` is the number of LLM calls this request actually made — agents
 * pipeline passes 2 or 3, single-shot passes 1 (the default). Called
 * only after the LLM(s) actually ran so failed/quota-rejected requests
 * don't burn the user's budget.
 *
 * Returns the new total for today.
 */
export async function incrementUsage(
  userId: string,
  by: number = 1,
): Promise<number> {
  if (!Number.isInteger(by) || by < 1) {
    throw new Error(`incrementUsage: invalid by=${by}`);
  }
  const [row] = await db
    .insert(llmUsage)
    .values({ userId, day: utcDay(), count: by })
    .onConflictDoUpdate({
      target: [llmUsage.userId, llmUsage.day],
      set: { count: sql`${llmUsage.count} + ${by}` },
    })
    .returning({ count: llmUsage.count });
  return row.count;
}
