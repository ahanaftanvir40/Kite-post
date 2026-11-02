const MASK = "[redacted]";

/** Remove every occurrence of each secret from a string. */
export function redactSecrets(text: string, secrets: readonly (string | undefined | null)[]): string {
  let out = text;
  for (const secret of secrets) {
    if (!secret || secret.length < 4) continue;
    out = out.split(secret).join(MASK);
    const compact = secret.replace(/\s+/g, "");
    if (compact !== secret && compact.length >= 4) out = out.split(compact).join(MASK);
  }
  return out;
}

/** Copy of `obj` with password-ish keys masked, for safe logging. */
export function redactObject<T>(value: T): T {
  const SENSITIVE = /pass|secret|token|authorization|cookie/i;
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") {
      return Object.fromEntries(
        Object.entries(v as Record<string, unknown>).map(([k, val]) => [k, SENSITIVE.test(k) ? MASK : walk(val)]),
      );
    }
    return v;
  };
  return walk(value) as T;
}
