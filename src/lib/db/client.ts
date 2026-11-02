import { MongoClient, type Db } from "mongodb";
import { getEnv } from "@/lib/env";

interface Cache {
  client?: MongoClient;
  uri?: string;
}

// Reused across hot reloads and warm serverless invocations so we do not
// open a new connection pool on every request.
const globalCache = globalThis as typeof globalThis & { __postieMongo?: Cache };

/** The shared database handle, or null when MONGODB_URI is not configured. */
export function getDb(): Db | null {
  const { mongoUri, mongoDb } = getEnv();
  if (!mongoUri) return null;
  const cache = (globalCache.__postieMongo ??= {});
  if (!cache.client || cache.uri !== mongoUri) {
    void cache.client?.close().catch(() => undefined);
    cache.client = new MongoClient(mongoUri, { maxPoolSize: 5, serverSelectionTimeoutMS: 6000 });
    cache.uri = mongoUri;
  }
  return cache.client.db(mongoDb);
}
