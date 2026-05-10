import "server-only";

/**
 * Voyage AI embedding wrapper.
 *
 * Used in two places:
 *   1. Build-time, by `scripts/embed-luts.ts`, to embed all 137 LUT
 *      descriptions and write them into `public/luts/manifest.json`.
 *   2. Runtime, by `lib/nlp/lut-retrieve.ts`, to embed the user's prompt
 *      so we can cosine-search against the manifest.
 *
 * Model: `voyage-3-lite`
 *   - 512-dim, asymmetric (query/document) embeddings
 *   - Free tier: 50M tokens/month — enough for ~200K user queries
 *   - Quality benchmarks above sentence-transformers/all-MiniLM-L6-v2
 *
 * Asymmetric retrieval:
 *   - Corpus (LUT descriptions) embedded with input_type="document"
 *   - User prompts embedded with input_type="query"
 *   This matters because Voyage applies different pooling per type;
 *   mixing them silently degrades cosine similarity.
 *
 * Token env: VOYAGE_API_KEY (free tier signup at https://dash.voyageai.com).
 * Failing the env var, throws — no silent fallback.
 */

const VOYAGE_API_URL = "https://api.voyageai.com/v1/embeddings";
const VOYAGE_MODEL = "voyage-3-lite";

function getToken(): string {
  const token = process.env.VOYAGE_API_KEY;
  if (!token) {
    throw new Error(
      "Missing VOYAGE_API_KEY env var. " +
        "Sign up free at https://dash.voyageai.com (50M tokens/month free tier, no credit card required) " +
        "and add VOYAGE_API_KEY=... to .env.local.",
    );
  }
  return token;
}

interface VoyageResponse {
  object: "list";
  data: { object: "embedding"; embedding: number[]; index: number }[];
  model: string;
  usage: { total_tokens: number };
}

async function callVoyage(
  inputs: string[],
  inputType: "query" | "document",
): Promise<number[][]> {
  const token = getToken();
  const res = await fetch(VOYAGE_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      input: inputs,
      model: VOYAGE_MODEL,
      input_type: inputType,
    }),
  });
  if (!res.ok) {
    let detail = "";
    try {
      detail = await res.text();
    } catch {
      /* ignore */
    }
    throw new Error(
      `Voyage embedding failed (${res.status}): ${detail.slice(0, 200)}`,
    );
  }
  const body = (await res.json()) as VoyageResponse;
  // Voyage may return out-of-order; sort by `index` to align with input order.
  body.data.sort((a, b) => a.index - b.index);
  return body.data.map((d) => d.embedding);
}

/** Embed a single user query (asymmetric, query side). */
export async function embed(text: string): Promise<number[]> {
  const out = await callVoyage([text], "query");
  return out[0];
}

/** Batch-embed corpus documents (asymmetric, document side). */
export async function embedBatch(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  return callVoyage(texts, "document");
}

export const EMBEDDING_MODEL = `voyageai/${VOYAGE_MODEL}`;
export const EMBEDDING_DIM = 512;
