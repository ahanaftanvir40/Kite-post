import type { SendOutcome } from "@/lib/mail/send";
import { ApiError, type OutgoingMessage } from "./api";

export const CHUNK_SIZE = 5;

export type StopSignal = "pause" | "cancel" | null;

export interface QueueDeps {
  post: (messages: OutgoingMessage[]) => Promise<{ outcomes: SendOutcome[]; halted: boolean }>;
  /** Checked before every chunk. */
  stopSignal: () => StopSignal;
  onOutcomes: (outcomes: SendOutcome[]) => void;
  chunkSize?: number;
}

export type QueueEnd =
  | { reason: "done" }
  | { reason: "paused" }
  | { reason: "cancelled" }
  | { reason: "fatal"; message: string };

/**
 * Walk the messages in small chunks. Row-level failures are reported through
 * `onOutcomes` and the walk continues; a halted batch or a request failure
 * stops it, leaving the rest pending so the user can resume.
 */
export async function runQueue(messages: OutgoingMessage[], deps: QueueDeps): Promise<QueueEnd> {
  const size = deps.chunkSize ?? CHUNK_SIZE;
  for (let i = 0; i < messages.length; i += size) {
    const signal = deps.stopSignal();
    if (signal === "pause") return { reason: "paused" };
    if (signal === "cancel") return { reason: "cancelled" };

    const chunk = messages.slice(i, i + size);
    let result: Awaited<ReturnType<QueueDeps["post"]>>;
    try {
      result = await deps.post(chunk);
    } catch (error) {
      const message = error instanceof ApiError ? error.message : "The send request failed. Try again.";
      return { reason: "fatal", message };
    }

    // Skipped rows were never attempted; they stay pending.
    deps.onOutcomes(result.outcomes.filter((o) => o.status !== "skipped"));

    if (result.halted) {
      const failure = result.outcomes.find((o) => o.status === "failed");
      return {
        reason: "fatal",
        message: failure && failure.status === "failed" ? failure.error : "The run was stopped by the mail server.",
      };
    }
  }
  return { reason: "done" };
}
