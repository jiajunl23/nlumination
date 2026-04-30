import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { llmUsage } from "@/lib/db/schema";

export const DAILY_LLM_LIMIT = 50;

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
 * Atomic upsert + increment. Called only after a successful Groq response
 * so that failed/quota-rejected calls don't burn the user's daily budget.
 * Returns the new count.
 */
export async function incrementUsage(userId: string): Promise<number> {
  const [row] = await db
    .insert(llmUsage)
    .values({ userId, day: utcDay(), count: 1 })
    .onConflictDoUpdate({
      target: [llmUsage.userId, llmUsage.day],
      set: { count: sql`${llmUsage.count} + 1` },
    })
    .returning({ count: llmUsage.count });
  return row.count;
}
