export function partners(): string[] {
  const list = (process.env.PARTNERS ?? "Socio 1,Socio 2,Socio 3")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  return list.length ? list : ["Socio 1", "Socio 2", "Socio 3"];
}

/** Env var holding a partner's own password hash, e.g. "Plugghe" → PASSWORD_HASH_PLUGGHE. */
export function partnerHashVar(partner: string): string {
  const slug = partner
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
  return `PASSWORD_HASH_${slug}`;
}

/** Each partner's own password if configured, otherwise the shared master password. */
export function passwordHashFor(partner: string): string | undefined {
  return process.env[partnerHashVar(partner)] || process.env.MASTER_PASSWORD_HASH || undefined;
}
