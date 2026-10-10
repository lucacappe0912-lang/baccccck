import "server-only";
import { db } from "./db";

export const INSIGHT_CATEGORIES = ["Strategia", "Crescita", "Marketing", "Operativo", "Promemoria", "Idea"] as const;

export type Insight = {
  id: number;
  title: string;
  body: string;
  category: string;
  pinned: number;
  done: number;
  due_date: string | null;
  author: string;
  created_at: string;
  updated_at: string;
};

export function listInsights(category?: string): Insight[] {
  const where = category ? "WHERE category = ?" : "";
  return db()
    .prepare(`SELECT * FROM insights ${where} ORDER BY done ASC, pinned DESC, COALESCE(due_date, '9999') ASC, updated_at DESC`)
    .all(...(category ? [category] : [])) as Insight[];
}

export function addInsight(input: { title: string; body: string; category: string; dueDate: string | null; author: string }) {
  db()
    .prepare("INSERT INTO insights(title, body, category, due_date, author) VALUES(?, ?, ?, ?, ?)")
    .run(input.title, input.body, input.category, input.dueDate, input.author);
}

export function updateInsight(id: number, input: { title: string; body: string; category: string; dueDate: string | null }) {
  db()
    .prepare("UPDATE insights SET title = ?, body = ?, category = ?, due_date = ?, updated_at = datetime('now') WHERE id = ?")
    .run(input.title, input.body, input.category, input.dueDate, id);
}

export function setInsightFlag(id: number, flag: "pinned" | "done", value: boolean) {
  const column = flag === "pinned" ? "pinned" : "done";
  db().prepare(`UPDATE insights SET ${column} = ?, updated_at = datetime('now') WHERE id = ?`).run(value ? 1 : 0, id);
}

export function deleteInsight(id: number) {
  db().prepare("DELETE FROM insights WHERE id = ?").run(id);
}
