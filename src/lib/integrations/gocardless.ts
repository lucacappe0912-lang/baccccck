import "server-only";
import { kvGet, kvSet } from "../db";
import { fetchJson, IntegrationError } from "./http";
import type { BankTx } from "../finance";

// GoCardless Bank Account Data (ex Nordigen) — PSD2 account information for EU banks.
// Docs: https://developer.gocardless.com/bank-account-data/overview
const BASE = "https://bankaccountdata.gocardless.com/api/v2";

type TokenCache = { access: string; expiresAt: number };
export type BankLink = { requisitionId: string; institutionId: string; institutionName: string; createdAt: string };

export function bankConfigured() {
  return Boolean(process.env.GOCARDLESS_SECRET_ID && process.env.GOCARDLESS_SECRET_KEY);
}

async function token(): Promise<string> {
  const cached = kvGet<TokenCache>("gocardless.token");
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.access;
  if (!bankConfigured()) throw new IntegrationError("Credenziali GoCardless non configurate.");
  const res = await fetchJson<{ access: string; access_expires: number }>(
    `${BASE}/token/new/`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ secret_id: process.env.GOCARDLESS_SECRET_ID, secret_key: process.env.GOCARDLESS_SECRET_KEY }),
    },
    "GoCardless token",
  );
  kvSet("gocardless.token", { access: res.access, expiresAt: Date.now() + res.access_expires * 1000 });
  return res.access;
}

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const access = await token();
  return fetchJson<T>(
    `${BASE}${path}`,
    { ...init, headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: `Bearer ${access}` } },
    "GoCardless",
  );
}

export async function listInstitutions(): Promise<{ id: string; name: string; logo: string }[]> {
  const country = process.env.BANK_COUNTRY ?? "IT";
  return api(`/institutions/?country=${encodeURIComponent(country)}`);
}

/** Starts the consent flow: returns the bank's authorisation URL. */
export async function createBankLink(institutionId: string, institutionName: string, redirectUrl: string): Promise<string> {
  const agreement = await api<{ id: string }>("/agreements/enduser/", {
    method: "POST",
    body: JSON.stringify({
      institution_id: institutionId,
      max_historical_days: 730,
      access_valid_for_days: 180,
      access_scope: ["balances", "details", "transactions"],
    }),
  }).catch(() => null); // some banks reject custom agreements → fall back to defaults
  const req = await api<{ id: string; link: string }>("/requisitions/", {
    method: "POST",
    body: JSON.stringify({
      redirect: redirectUrl,
      institution_id: institutionId,
      reference: `backrooms-${Date.now()}`,
      user_language: "IT",
      ...(agreement ? { agreement: agreement.id } : {}),
    }),
  });
  kvSet("bank.pending", { requisitionId: req.id, institutionId, institutionName, createdAt: new Date().toISOString() });
  return req.link;
}

export async function finalizeBankLink(): Promise<BankLink> {
  const pending = kvGet<BankLink>("bank.pending");
  if (!pending) throw new IntegrationError("Nessun collegamento bancario in corso.");
  const req = await api<{ status: string; accounts: string[] }>(`/requisitions/${pending.requisitionId}/`);
  if (req.status !== "LN" || req.accounts.length === 0) {
    throw new IntegrationError(`Consenso non completato (stato: ${req.status}).`);
  }
  kvSet("bank.link", pending);
  kvSet("bank.accounts", req.accounts);
  return pending;
}

export function currentBankLink() {
  return { link: kvGet<BankLink>("bank.link"), accounts: kvGet<string[]>("bank.accounts") ?? [] };
}

export function disconnectBank() {
  kvSet("bank.link", null);
  kvSet("bank.accounts", []);
}

type GcTx = {
  transactionId?: string;
  internalTransactionId?: string;
  bookingDate?: string;
  valueDate?: string;
  transactionAmount: { amount: string; currency: string };
  remittanceInformationUnstructured?: string;
  remittanceInformationUnstructuredArray?: string[];
  additionalInformation?: string;
  creditorName?: string;
  debtorName?: string;
};

export async function fetchBankTransactions(dateFrom: string): Promise<BankTx[]> {
  const { accounts } = currentBankLink();
  if (!accounts.length) throw new IntegrationError("Nessun conto collegato.");
  const out: BankTx[] = [];
  for (const accountId of accounts) {
    const res = await api<{ transactions: { booked: GcTx[] } }>(
      `/accounts/${accountId}/transactions/?date_from=${dateFrom}`,
    );
    for (const t of res.transactions.booked) {
      const date = t.bookingDate ?? t.valueDate;
      const id = t.transactionId ?? t.internalTransactionId;
      if (!date || !id) continue;
      const amount = Math.round(Number(t.transactionAmount.amount) * 100);
      out.push({
        id: `${accountId}:${id}`,
        date,
        amountCents: amount,
        description:
          t.remittanceInformationUnstructured ??
          t.remittanceInformationUnstructuredArray?.join(" ") ??
          t.additionalInformation ??
          "",
        counterparty: (amount > 0 ? t.debtorName : t.creditorName) ?? "",
        accountId,
      });
    }
  }
  return out;
}
