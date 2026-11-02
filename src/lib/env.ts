export interface AppEnv {
  sessionSecret: string;
  accessCode: string | null;
  maxRecipientsPerRun: number;
  sendDelayMs: number;
  isProduction: boolean;
  localAccount: LocalAccount | null;
  /** MongoDB connection string. Null means saving is switched off. */
  mongoUri: string | null;
  mongoDb: string;
}

export interface LocalAccount {
  user: string;
  pass: string;
  fromAddress: string;
  fromName: string;
  replyTo: string;
}

const DEV_SECRET = "postie-dev-only-secret-not-for-production-use-0123456789";

function toInt(value: string | undefined, fallback: number, min: number, max: number): number {
  const n = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/**
 * Read configuration lazily so tests (and `next build`) never need real secrets.
 * In production a 32+ character SESSION_SECRET is mandatory.
 */
export function getEnv(source: NodeJS.ProcessEnv = process.env): AppEnv {
  const isProduction = source.NODE_ENV === "production";
  let sessionSecret = source.SESSION_SECRET ?? "";
  if (sessionSecret.length < 32) {
    if (isProduction) {
      throw new Error("SESSION_SECRET must be set to at least 32 characters in production.");
    }
    sessionSecret = DEV_SECRET;
  }

  const user = source.SMTP_USER?.trim();
  const pass = source.SMTP_APP_PASSWORD?.replace(/\s+/g, "");
  const localAccount: LocalAccount | null =
    !isProduction && user && pass
      ? {
          user,
          pass,
          fromAddress: source.MAIL_FROM_ADDRESS?.trim() || user,
          fromName: source.MAIL_FROM_NAME?.trim() || "",
          replyTo: source.MAIL_REPLY_TO?.trim() || source.MAIL_FROM_ADDRESS?.trim() || user,
        }
      : null;

  return {
    sessionSecret,
    accessCode: source.ACCESS_CODE?.trim() || null,
    maxRecipientsPerRun: toInt(source.MAX_RECIPIENTS_PER_RUN, 100, 1, 2000),
    sendDelayMs: toInt(source.SEND_DELAY_MS, 1500, 0, 10_000),
    isProduction,
    localAccount,
    mongoUri: source.MONGODB_URI?.trim() || null,
    mongoDb: source.MONGODB_DB?.trim() || "postie",
  };
}
