"use client";

import { Check, Eye, EyeOff, LogOut, Send, ShieldCheck, TriangleAlert } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { useMotion, gsap, EASE_OUT } from "@/lib/motion";
import { ApiError, connect, connectLocal, disconnect } from "../api";
import { useTestSend } from "../hooks";
import { useMergeStore } from "../store";
import { SavedSenders } from "./SavedSenders";

const GUIDE = [
  {
    title: "Turn on 2-Step Verification",
    body: "Google only offers app passwords once 2-Step Verification is on for the mailbox you send from.",
  },
  {
    title: "Create an app password",
    body: "Open your Google Account, search for App passwords, name it Kitepost and copy the 16 letters.",
  },
  {
    title: "Paste it here",
    body: "Spaces are fine. Add the alias you want to send as; it must already be a verified Send-as address in that mailbox.",
  },
];

export function ConnectPanel() {
  const session = useMergeStore((s) => s.session);
  const setSession = useMergeStore((s) => s.setSession);
  const setStep = useMergeStore((s) => s.setStep);
  const testSent = useMergeStore((s) => s.testSent);

  const root = useRef<HTMLDivElement>(null);
  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [fromName, setFromName] = useState("");
  const [fromAddress, setFromAddress] = useState("");
  const [replyTo, setReplyTo] = useState("");
  const [accessCode, setAccessCode] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const test = useTestSend();

  const connected = Boolean(session?.connected && session.profile);

  useMotion(
    ({ reduce }) => {
      if (reduce) return;
      gsap.from(".guide-step", { autoAlpha: 0, y: 10, duration: 0.5, ease: EASE_OUT, stagger: 0.08 });
    },
    { scope: root },
  );

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const status = await connect({ user, password, fromName, fromAddress, replyTo, accessCode });
      setPassword("");
      setSession(status);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not connect. Try again.");
    } finally {
      setPending(false);
    }
  }

  async function connectWithLocal() {
    setPending(true);
    setError(null);
    try {
      setSession(await connectLocal(accessCode));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not connect. Try again.");
    } finally {
      setPending(false);
    }
  }

  async function leave() {
    setPending(true);
    try {
      await disconnect();
    } finally {
      setSession({
        connected: false,
        accessCodeRequired: session?.accessCodeRequired ?? false,
        localAccountAvailable: session?.localAccountAvailable ?? false,
        maxRecipientsPerRun: session?.maxRecipientsPerRun ?? 100,
      });
      setPending(false);
    }
  }

  return (
    <div ref={root} className="grid max-w-4xl gap-10 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:gap-16">
      <section aria-labelledby="connect-title">
        <h2 id="connect-title" className="font-display text-2xl font-semibold tracking-[-0.025em]">
          {connected ? "Mailbox connected" : "Connect your mailbox"}
        </h2>

        {connected && session?.profile ? (
          <div className="mt-4 space-y-5">
            <dl className="divide-y divide-line rounded-stamp border border-line bg-sheet text-sm">
              {[
                ["Signed in as", session.profile.user],
                ["Sending as", session.profile.fromName ? `${session.profile.fromName} <${session.profile.fromAddress}>` : session.profile.fromAddress],
                ["Replies go to", session.profile.replyTo],
              ].map(([term, detail]) => (
                <div key={term} className="grid grid-cols-[7.5rem_1fr] gap-3 px-3 py-2.5">
                  <dt className="text-ink-3">{term}</dt>
                  <dd className="min-w-0 break-words font-mono text-[13px]">{detail}</dd>
                </div>
              ))}
            </dl>

            <div>
              <p className="text-sm text-ink-2">
                Google never says whether an alias is verified, so the only reliable check is a real email. Send one to
                yourself and look at the From line.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button onClick={() => void test.send()} loading={test.pending} icon={<Send className="size-4" aria-hidden />}>
                  Send a test to me
                </Button>
                {testSent ? (
                  <span role="status" className="inline-flex items-center gap-1.5 text-sm text-sent">
                    <Check className="size-4" aria-hidden /> Sent to {session.profile.user}
                  </span>
                ) : null}
              </div>
              {test.error ? (
                <p role="alert" className="mt-2 text-sm text-failed">
                  {test.error}
                </p>
              ) : null}
            </div>

            <SavedSenders />

            <div className="flex flex-wrap gap-2 border-t border-line pt-4">
              <Button variant="primary" onClick={() => setStep("recipients")}>
                Continue to recipients
              </Button>
              <Button variant="ghost" onClick={() => void leave()} loading={pending} icon={<LogOut className="size-4" aria-hidden />}>
                Disconnect
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-4 space-y-4" noValidate>
            <TextField
              label="Mailbox you sign in with"
              type="email"
              autoComplete="off"
              spellCheck={false}
              placeholder="team@yourcompany.com"
              value={user}
              onChange={(e) => setUser(e.target.value)}
              required
            />
            <TextField
              label="App password"
              type={showPassword ? "text" : "password"}
              autoComplete="off"
              spellCheck={false}
              mono
              placeholder="abcd efgh ijkl mnop"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              hint="Stored encrypted and tied to your signed-in account, so you stay connected across visits and devices. Disconnect removes it."
              trailing={
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide app password" : "Show app password"}
                  aria-pressed={showPassword}
                  className="grid size-8 max-sm:size-11 cursor-pointer place-items-center rounded-stamp text-ink-3 hover:bg-sunk hover:text-ink"
                >
                  {showPassword ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
                </button>
              }
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField label="Display name" placeholder="ResumeStart Team" value={fromName} onChange={(e) => setFromName(e.target.value)} />
              <TextField
                label="Send as"
                type="email"
                placeholder="Defaults to the mailbox"
                value={fromAddress}
                onChange={(e) => setFromAddress(e.target.value)}
              />
            </div>
            <TextField
              label="Replies go to"
              type="email"
              placeholder="Defaults to the Send as address"
              value={replyTo}
              onChange={(e) => setReplyTo(e.target.value)}
            />
            {session?.accessCodeRequired ? (
              <TextField label="Access code" type="password" autoComplete="off" value={accessCode} onChange={(e) => setAccessCode(e.target.value)} />
            ) : null}

            {error ? (
              <div role="alert" className="flex gap-2 rounded-stamp bg-failed-wash px-3 py-2.5 text-sm text-failed">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                <p>{error}</p>
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" variant="primary" loading={pending} disabled={!user.trim() || !password.trim()}>
                {pending ? "Checking with Google" : "Connect"}
              </Button>
              {session?.localAccountAvailable ? (
                <Button onClick={() => void connectWithLocal()} disabled={pending}>
                  Use local default account
                </Button>
              ) : null}
            </div>
          </form>
        )}
      </section>

      <aside aria-labelledby="guide-title" className="lg:pt-1">
        <h2 id="guide-title" className="font-display text-2xl font-semibold tracking-[-0.025em]">
          Before you start
        </h2>
        <ol className="mt-4 space-y-4">
          {GUIDE.map((item, i) => (
            <li key={item.title} className="guide-step flex gap-3">
              <span aria-hidden className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-kite-ink font-display text-sm font-semibold text-white tnum">
                {i + 1}
              </span>
              <div>
                <h3 className="font-medium">{item.title}</h3>
                <p className="mt-0.5 max-w-prose text-sm text-ink-2">{item.body}</p>
              </div>
            </li>
          ))}
        </ol>
        <div className="mt-6 flex max-w-prose gap-2.5 rounded-stamp border border-line bg-sheet px-3.5 py-3 text-sm text-ink-2">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-postal" aria-hidden />
          <p>
            Your app password is encrypted with AES-256 before it is stored, is only used to send your emails, and is never
            shown again. You can disconnect at any time to delete it.
          </p>
        </div>
      </aside>
    </div>
  );
}
