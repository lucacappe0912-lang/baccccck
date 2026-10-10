import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { db, tx } from "./db";
import { findColumn, parseCsv, parseLooseDate } from "./csv";
import { parseEuroToCents } from "./format";

export const CATEGORIES_IN = ["Sessioni", "Mix & Master", "Produzioni", "Pacchetti", "Beat", "Altro"] as const;
export const CATEGORIES_OUT = [
  "Affitto",
  "Attrezzatura",
  "Software & Plugin",
  "Marketing",
  "Utenze",
  "Compensi",
  "Tasse",
  "Altro",
] as const;

export type Transaction = {
  id: string;
  date: string;
  amount_cents: number;
  description: string;
  counterparty: string;
  category: string;
  source: "bank" | "cash" | "import";
  created_by: string | null;
};

export type MonthRow = { month: number; income: number; expenses: number; profit: number; margin: number | null };

export function listTransactions(opts: { year: number; month?: number; source?: string; limit?: number }): Transaction[] {
  const prefix = opts.month ? `${opts.year}-${String(opts.month).padStart(2, "0")}` : String(opts.year);
  const params: (string | number)[] = [`${prefix}%`];
  let sql = "SELECT * FROM transactions WHERE date LIKE ?";
  if (opts.source) {
    sql += " AND source = ?";
    params.push(opts.source);
  }
  sql += " ORDER BY date DESC, created_at DESC LIMIT ?";
  params.push(opts.limit ?? 500);
  return db().prepare(sql).all(...params) as Transaction[];
}

export function monthlySummary(year: number): MonthRow[] {
  const rows = db()
    .prepare(
      `SELECT CAST(substr(date, 6, 2) AS INTEGER) AS month,
              SUM(CASE WHEN amount_cents > 0 THEN amount_cents ELSE 0 END) AS income,
              SUM(CASE WHEN amount_cents < 0 THEN -amount_cents ELSE 0 END) AS expenses
         FROM transactions WHERE date LIKE ? GROUP BY month`,
    )
    .all(`${year}%`) as { month: number; income: number; expenses: number }[];
  const byMonth = new Map(rows.map((r) => [r.month, r]));
  return Array.from({ length: 12 }, (_, i) => {
    const r = byMonth.get(i + 1);
    const income = r?.income ?? 0;
    const expenses = r?.expenses ?? 0;
    const profit = income - expenses;
    return { month: i + 1, income, expenses, profit, margin: income > 0 ? profit / income : null };
  });
}

export function categoryBreakdown(year: number, month?: number) {
  const prefix = month ? `${year}-${String(month).padStart(2, "0")}` : String(year);
  return db()
    .prepare(
      `SELECT category, SUM(amount_cents) AS total, COUNT(*) AS n
         FROM transactions WHERE date LIKE ? GROUP BY category ORDER BY ABS(SUM(amount_cents)) DESC`,
    )
    .all(`${prefix}%`) as { category: string; total: number; n: number }[];
}

export function balances() {
  return db()
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN source = 'cash' THEN amount_cents END), 0) AS cash,
         COALESCE(SUM(CASE WHEN source != 'cash' THEN amount_cents END), 0) AS bank,
         COALESCE(SUM(amount_cents), 0) AS total
       FROM transactions`,
    )
    .get() as { cash: number; bank: number; total: number };
}

export function availableYears(): number[] {
  const rows = db().prepare("SELECT DISTINCT substr(date, 1, 4) AS y FROM transactions ORDER BY y DESC").all() as {
    y: string;
  }[];
  const years = new Set(rows.map((r) => Number(r.y)));
  years.add(new Date().getFullYear());
  return [...years].sort((a, b) => b - a);
}

export function addCashTransaction(input: {
  date: string;
  amountCents: number;
  description: string;
  category: string;
  author: string;
}) {
  db()
    .prepare(
      `INSERT INTO transactions(id, date, amount_cents, description, category, source, created_by)
       VALUES(?, ?, ?, ?, ?, 'cash', ?)`,
    )
    .run(`cash:${randomUUID()}`, input.date, input.amountCents, input.description, input.category, input.author);
}

export function updateCategory(id: string, category: string) {
  db().prepare("UPDATE transactions SET category = ? WHERE id = ?").run(category, id);
}

/** Bank-synced transactions are the bank's record and cannot be deleted from the hub. */
export function deleteManualTransaction(id: string) {
  db().prepare("DELETE FROM transactions WHERE id = ? AND source IN ('cash', 'import')").run(id);
}

export type BankTx = {
  id: string;
  date: string;
  amountCents: number;
  description: string;
  counterparty: string;
  accountId: string;
};

const AUTO_RULES: [RegExp, string][] = [
  [/affitto|locazione|canone/i, "Affitto"],
  [/enel|a2a|iren|hera|tim|vodafone|fastweb|iliad|wind|bolletta|luce|gas/i, "Utenze"],
  [/meta|facebook|instagram|tiktok ads|google ads|sponsor/i, "Marketing"],
  [/thomann|musicstore|strumentimusicali|amazon/i, "Attrezzatura"],
  [/plugin|waves|izotope|fabfilter|native instruments|splice|apple\.com|adobe|avid|ableton/i, "Software & Plugin"],
  [/f24|agenzia entrate|inps|iva/i, "Tasse"],
];

export function guessCategory(text: string, amountCents: number): string {
  if (amountCents > 0) return /mix|master/i.test(text) ? "Mix & Master" : /pacchett/i.test(text) ? "Pacchetti" : "Sessioni";
  return AUTO_RULES.find(([re]) => re.test(text))?.[1] ?? "Altro";
}

/** Inserts new bank transactions, keeping categories the partners already edited. */
export function upsertBankTransactions(rows: BankTx[]): number {
  const insert = db().prepare(
    `INSERT INTO transactions(id, date, amount_cents, description, counterparty, category, source, account_id)
     VALUES(?, ?, ?, ?, ?, ?, 'bank', ?) ON CONFLICT(id) DO NOTHING`,
  );
  let added = 0;
  tx(() => {
    for (const r of rows) {
      const res = insert.run(
        `bank:${r.id}`,
        r.date,
        r.amountCents,
        r.description,
        r.counterparty,
        guessCategory(`${r.description} ${r.counterparty}`, r.amountCents),
        r.accountId,
      );
      added += Number(res.changes);
    }
  });
  return added;
}

/** Imports an Italian-bank style CSV statement (fallback when the PSD2 connection isn't available). */
export function importStatementCsv(text: string, author: string): { added: number; skipped: number } {
  const [headers, ...rows] = parseCsv(text);
  if (!headers) return { added: 0, skipped: 0 };
  const iDate = findColumn(headers, ["data contabile", "data operazione", "data", "date", "booking date"]);
  const iAmount = findColumn(headers, ["importo", "amount", "importo eur"]);
  const iIn = findColumn(headers, ["entrate", "avere", "accrediti"]);
  const iOut = findColumn(headers, ["uscite", "dare", "addebiti"]);
  const iDesc = findColumn(headers, ["descrizione", "causale", "description", "dettagli", "operazione"]);
  if (iDate < 0 || (iAmount < 0 && iIn < 0 && iOut < 0)) {
    throw new Error("Colonne non riconosciute: servono almeno Data e Importo (oppure Entrate/Uscite).");
  }
  const insert = db().prepare(
    `INSERT INTO transactions(id, date, amount_cents, description, category, source, created_by)
     VALUES(?, ?, ?, ?, ?, 'import', ?) ON CONFLICT(id) DO NOTHING`,
  );
  let added = 0;
  let skipped = 0;
  const seen = new Map<string, number>();
  tx(() => {
    rows.forEach((r) => {
      const date = parseLooseDate(r[iDate] ?? "");
      let cents: number | null = null;
      if (iAmount >= 0) cents = parseEuroToCents(r[iAmount] ?? "");
      else {
        const inc = iIn >= 0 ? parseEuroToCents(r[iIn] ?? "") : null;
        const out = iOut >= 0 ? parseEuroToCents(r[iOut] ?? "") : null;
        cents = inc ? Math.abs(inc) : out ? -Math.abs(out) : null;
      }
      if (!date || !cents) {
        skipped++;
        return;
      }
      const description = (iDesc >= 0 ? r[iDesc] : "")?.trim() ?? "";
      // Deterministic id (with an occurrence counter for identical rows) → re-importing
      // the same or an overlapping statement never duplicates movements.
      const base = `${date}|${cents}|${description}`;
      const occurrence = (seen.get(base) ?? 0) + 1;
      seen.set(base, occurrence);
      const id = `import:${createHash("sha1").update(`${base}|${occurrence}`).digest("hex")}`;
      const res = insert.run(id, date, cents, description, guessCategory(description, cents), author);
      if (Number(res.changes)) added++;
      else skipped++;
    });
  });
  return { added, skipped };
}
