# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Next.js (App Router, TypeScript), Tailwind CSS, GSAP (`gsap`, `@gsap/react`) for motion, Vitest for tests. User-confirmed.

## Users

Small teams doing personalised outreach (recruiting, sales, partnerships) who need to send 20-100 individually addressed emails at a time from their own work address. The primary scenario: send from a branded alias (e.g. `team@resumestart.ai`) that Gmail's built-in mail merge will not allow, using a Google Workspace mailbox (`team@mybedigital.com`) that has the alias configured as a verified Send-as address.

## Product Purpose

Kitepost is a free, visual mail merge. The user uploads an Excel/CSV file, writes one template using `@column` tokens (`@firstname`), previews every row, and sends in small paced batches over SMTP. Success: a user goes from a spreadsheet to a confident, correctly personalised send in a few minutes, with no row sent that they did not see.

## Positioning

Gmail-style `@firstname` merge that sends from any verified alias, with a bring-your-own app password model: no accounts, no stored credentials, nothing persisted on the server. A hosted SaaS cannot truthfully claim that.

## Operating Context

- User supplies their own Google App Password (2-Step Verification required); it lives only in an encrypted httpOnly session cookie (~2h idle expiry) and is never written to disk or a database.
- Sending is SMTP via Nodemailer to `smtp.gmail.com` (preset host allowlist, no arbitrary hosts).
- Batches of 20, sent in chunks of 5 with jittered delays to stay within Gmail limits.
- Replies go to the alias (`replyTo`), so they land in the shared inbox.
- History is session-only for now; a database is a later addition.

## Capabilities and Constraints

- Upload `.xlsx`, `.xls`, `.csv`; parsed client-side (SheetJS 0.20.3 vendored from cdn.sheetjs.com). Multi-sheet picker.
- Token interpolation: `@firstname` matches headers case/symbol-insensitively; email addresses such as `a@b.com` are never treated as tokens; per-token fallback values; HTML-escaped body values; CRLF stripped from subject/headers.
- Row flags: invalid email, duplicate email, missing token value; users can exclude rows.
- Test send to self before the real send; pause, retry failed, download results CSV.
- Google may deprecate third-party Send-as in 2027; resumestart.ai mail is hosted on Google Workspace, which mitigates this. Hosting target is undecided.

## Brand Commitments

Name: Kitepost (renamed from the working name Postie). Send identity defaults: `ResumeStart Team <team@resumestart.ai>`.

## Evidence on Hand

No customer proof, testimonials, benchmarks or pricing exist. None may be invented.

## Product Principles

1. Never surprise the sender: every merged message is previewable and every skipped or flagged row is explained before sending.
2. Credentials are the user's: held briefly, in memory and an encrypted cookie, never persisted or logged.
3. Slow and steady beats blocked: pacing and batch caps are features, shown honestly.
4. Plain language over jargon: SMTP, app passwords and aliases are explained in context, not assumed.
5. Fast to the first successful test send.

## Accessibility & Inclusion

WCAG AA contrast, full keyboard operation, visible focus, and `prefers-reduced-motion` respected in every animation.
