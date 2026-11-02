import nodemailer, { type Transporter } from "nodemailer";
import { getProvider, type ProviderId } from "./providers";

export interface Credentials {
  user: string;
  pass: string;
  preset: ProviderId;
}

export interface Mailer {
  verify(): Promise<unknown>;
  sendMail(message: OutgoingMail): Promise<unknown>;
  close(): void;
}

export interface OutgoingMail {
  from: { name: string; address: string };
  replyTo: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
}

export type MailerFactory = (credentials: Credentials) => Mailer;

/** The single seam where SMTP is created. Swap this for OAuth / Gmail API later. */
export const createMailer: MailerFactory = (credentials) => {
  const preset = getProvider(credentials.preset);
  const transporter: Transporter = nodemailer.createTransport({
    host: preset.host,
    port: preset.port,
    secure: preset.secure,
    auth: { user: credentials.user, pass: credentials.pass },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
  });
  return {
    verify: () => transporter.verify(),
    sendMail: (message) => transporter.sendMail(message),
    close: () => transporter.close(),
  };
};
