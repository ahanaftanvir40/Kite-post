export type MailErrorCode =
  | "auth"
  | "rate-limit"
  | "connection"
  | "recipient"
  | "message"
  | "unknown";

export interface MappedMailError {
  code: MailErrorCode;
  /** Plain-language message with a fix, safe to show in the UI. */
  message: string;
  /** Stops the whole run: no other recipient will fare better. */
  fatal: boolean;
}

interface MailLikeError {
  code?: unknown;
  responseCode?: unknown;
  response?: unknown;
  command?: unknown;
  message?: unknown;
}

export function mapMailError(error: unknown): MappedMailError {
  const e = (error ?? {}) as MailLikeError;
  const responseCode = typeof e.responseCode === "number" ? e.responseCode : undefined;
  const code = typeof e.code === "string" ? e.code : "";
  const response = typeof e.response === "string" ? e.response : "";
  const text = `${response} ${typeof e.message === "string" ? e.message : ""}`;

  if (code === "EAUTH" || responseCode === 535 || responseCode === 534 || /Username and Password not accepted|BadCredentials/i.test(text)) {
    return {
      code: "auth",
      fatal: true,
      message:
        "Google rejected the app password. Check it was copied without spaces, has not been revoked, and belongs to this account. If you cannot create app passwords, turn on 2-Step Verification (an admin may also have restricted them).",
    };
  }

  if (responseCode === 550 && /5\.4\.5|daily|limit|quota/i.test(text)) {
    return {
      code: "rate-limit",
      fatal: true,
      message:
        "Daily sending limit reached. The run has stopped and the remaining rows are still pending. Google resets the quota on a rolling 24 hours.",
    };
  }
  if (responseCode === 421 || responseCode === 452 || /rate limit|too many|try again later/i.test(text)) {
    return {
      code: "rate-limit",
      fatal: true,
      message: "Google asked us to slow down. The run has stopped. Wait a while, then retry the pending rows.",
    };
  }

  if (
    ["ECONNECTION", "ETIMEDOUT", "ESOCKET", "ECONNREFUSED", "ECONNRESET", "ENOTFOUND", "EDNS", "ETIMEOUT"].includes(code)
  ) {
    return {
      code: "connection",
      fatal: true,
      message: "Could not reach Google's mail server. Check your connection and try again.",
    };
  }

  if (code === "EENVELOPE" || (responseCode !== undefined && responseCode >= 550 && responseCode < 560)) {
    return {
      code: "recipient",
      fatal: false,
      message: "Google refused this address. It may not exist or may be blocking mail.",
    };
  }

  if (code === "EMESSAGE" || responseCode === 552 || responseCode === 554) {
    return {
      code: "message",
      fatal: false,
      message: "Google rejected this message. It may be too large or look like spam.",
    };
  }

  return {
    code: "unknown",
    fatal: false,
    message: "The message could not be sent. Try this row again.",
  };
}
