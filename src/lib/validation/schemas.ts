import { z } from "zod";
import { isValidEmail } from "@/lib/spreadsheet/email";
import { PROVIDER_IDS } from "@/lib/mail/providers";

const workspaceId = z.string().trim().min(1).max(64);

export const MAX_MESSAGES_PER_REQUEST = 10;
export const MAX_SUBJECT_LENGTH = 300;
export const MAX_HTML_LENGTH = 200_000;

const emailField = z
  .string()
  .trim()
  .refine(isValidEmail, { message: "Enter a valid email address." });

const noLineBreaks = (label: string) =>
  z
    .string()
    .trim()
    .max(120)
    .refine((v) => !/[\r\n]/.test(v), { message: `${label} cannot contain line breaks.` });

/** App passwords are 16 letters, shown in groups of four. Spaces are tolerated and removed. */
const appPassword = z
  .string()
  .transform((v) => v.replace(/\s+/g, ""))
  .refine((v) => v.length >= 8 && v.length <= 128, { message: "Paste the app password from your Google account." });

export const connectSchema = z.object({
  preset: z.enum(PROVIDER_IDS as [string, ...string[]]).default("gmail"),
  user: emailField,
  password: appPassword,
  fromName: noLineBreaks("Display name").default(""),
  fromAddress: emailField.optional(),
  replyTo: emailField.optional(),
  accessCode: z.string().max(200).optional(),
});
export type ConnectInput = z.infer<typeof connectSchema>;

export const messageSchema = z.object({
  rowId: z.string().min(1).max(64),
  to: emailField,
  subject: z
    .string()
    .max(MAX_SUBJECT_LENGTH)
    .refine((v) => v.trim().length > 0, { message: "Subject is empty." }),
  html: z
    .string()
    .max(MAX_HTML_LENGTH)
    .refine((v) => v.trim().length > 0, { message: "Message body is empty." }),
});
export type MessageSchemaInput = z.infer<typeof messageSchema>;

export const sendSchema = z.object({
  messages: z.array(messageSchema).min(1).max(MAX_MESSAGES_PER_REQUEST),
  /** Present when the client wants this chunk recorded in send history. */
  run: z
    .object({
      runId: z.string().min(8).max(64).regex(/^[A-Za-z0-9_-]+$/),
      subject: z.string().max(MAX_SUBJECT_LENGTH),
      /** The spreadsheet the recipients came from, so history can say which file was sent. */
      fileName: z.string().trim().max(200).optional(),
      /** The workspace this send belongs to. Checked against the signed-in mailbox before anything is written. */
      workspaceId,
    })
    .optional(),
});

export const testSendSchema = z.object({
  subject: messageSchema.shape.subject,
  html: messageSchema.shape.html,
});

const savedName = z
  .string()
  .trim()
  .min(1, { message: "Give it a name." })
  .max(80, { message: "Keep the name under 80 characters." })
  .refine((v) => !/[\r\n]/.test(v), { message: "The name cannot contain line breaks." });

export const workspaceSaveSchema = z.object({ name: savedName });

export const MAX_SAVED_ROWS = 2000;
export const MAX_SAVED_COLUMNS = 100;
const cell = z.string().max(2000);

export const templateSaveSchema = z.object({
  name: savedName,
  subject: z.string().max(MAX_SUBJECT_LENGTH),
  body: z.string().max(MAX_HTML_LENGTH),
  fallbacks: z.record(z.string().max(60), z.string().max(200)).refine((v) => Object.keys(v).length <= 100, {
    message: "Too many fallbacks.",
  }),
});

export const listSaveSchema = z
  .object({
    name: savedName,
    fileName: z.string().trim().max(200),
    headers: z.array(z.string().max(200)).min(1).max(MAX_SAVED_COLUMNS),
    emailColumn: z.string().max(200),
    rows: z.array(z.record(z.string().max(200), cell)).min(1, { message: "There are no rows to save." }).max(MAX_SAVED_ROWS),
  })
  .refine((v) => v.headers.includes(v.emailColumn), { message: "The email column is not one of the headers." });

export const senderSaveSchema = z.object({
  fromName: noLineBreaks("Display name").default(""),
  fromAddress: emailField,
  replyTo: emailField,
});

export const senderSelectSchema = z.object({ senderId: z.string().min(1).max(64) });

export const listDoneSchema = z.object({ done: z.boolean() });

export const SAVED_KINDS = ["templates", "lists", "senders", "runs"] as const;
export type SavedKind = (typeof SAVED_KINDS)[number];

export function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Invalid request.";
}
