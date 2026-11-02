export type ProviderId = "gmail";

export interface ProviderPreset {
  id: ProviderId;
  label: string;
  host: string;
  port: number;
  secure: boolean;
}

/**
 * Hosts are allow-listed on purpose: the client only ever names a preset, never
 * a host, so the server cannot be pointed at internal addresses or used as a
 * general relay.
 */
export const PROVIDERS: Record<ProviderId, ProviderPreset> = {
  gmail: {
    id: "gmail",
    label: "Gmail or Google Workspace",
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
  },
};

export const PROVIDER_IDS = Object.keys(PROVIDERS) as ProviderId[];

export function getProvider(id: ProviderId): ProviderPreset {
  return PROVIDERS[id];
}

export interface QuotaHint {
  perDay: number;
  label: string;
}

/** Approximate daily sending limit. Shown as a hint, never enforced. */
export function quotaHint(accountEmail: string): QuotaHint {
  const domain = accountEmail.split("@")[1]?.toLowerCase() ?? "";
  if (domain === "gmail.com" || domain === "googlemail.com") {
    return { perDay: 500, label: "about 500 recipients a day on a personal Gmail account" };
  }
  return { perDay: 2000, label: "about 2,000 messages a day on Google Workspace" };
}
