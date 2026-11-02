import { getDb } from "./client";
import { createMongoStore, ensureIndexes } from "./mongo";
import type { Store } from "./types";

export * from "./types";

let override: Store | null | undefined;
let cached: { store: Store; ready: Promise<void> } | null = null;

/** Test hook: pass a Store (or null for "saving off"); pass undefined to restore normal behaviour. */
export function setStoreForTests(store: Store | null | undefined): void {
  override = store;
  cached = null;
}

/** Like getStore, but a database that cannot be reached reads as "no store" instead of throwing. */
export async function getStoreOrNull(): Promise<Store | null> {
  try {
    return await getStore();
  } catch {
    return null;
  }
}

/** The persistence layer for this request, or null when no database is configured. */
export async function getStore(): Promise<Store | null> {
  if (override !== undefined) return override;
  const db = getDb();
  if (!db) return null;
  if (!cached) {
    const ready = ensureIndexes(db).catch((error: unknown) => {
      // Let the next request retry rather than caching a failed setup.
      cached = null;
      throw error;
    });
    cached = { store: createMongoStore(db), ready };
  }
  await cached.ready;
  return cached.store;
}