import { requireSession } from "@/lib/auth";
import { INSIGHT_CATEGORIES, listInsights } from "@/lib/insights";
import { fmtDate, today } from "@/lib/format";
import { Card, Empty, PageHead } from "@/components/ui";
import { ActionForm } from "@/components/ActionForm";
import { SubmitButton } from "@/components/SubmitButton";
import { ConfirmButton } from "@/components/ConfirmButton";
import { addInsightAction, deleteInsightAction, insightFlagAction, updateInsightAction } from "../actions";

export const metadata = { title: "Consigli & Insights" };

export default async function InsightsPage({ searchParams }: { searchParams: Promise<{ cat?: string }> }) {
  await requireSession();
  const { cat } = await searchParams;
  const category = (INSIGHT_CATEGORIES as readonly string[]).includes(cat ?? "") ? cat : undefined;
  const notes = listInsights(category);
  const t = today();

  return (
    <>
      <PageHead
        eyebrow="Visione condivisa"
        title="Consigli & Insights"
        intro="Linee guida strategiche, idee di crescita e promemoria operativi dei tre soci. Fissa in alto ciò che conta."
        actions={
          <div className="segmented">
            <a href="/insights" aria-current={!category}>Tutto</a>
            {INSIGHT_CATEGORIES.map((c) => (
              <a key={c} href={`/insights?cat=${encodeURIComponent(c)}`} aria-current={category === c}>{c}</a>
            ))}
          </div>
        }
      />

      <div className="grid cols-3" style={{ alignItems: "start" }}>
        <div className="span-2">
          {notes.length === 0 ? (
            <Card><Empty glyph="✦" title="La bacheca è vuota">Scrivi la prima linea guida per lo studio.</Empty></Card>
          ) : (
            <div className="grid cols-2">
              {notes.map((n) => (
                <article key={n.id} className={`card note-card ${n.pinned ? "pinned" : ""} ${n.done ? "is-done" : ""}`}>
                  <div className="row between">
                    <span className="badge plain">{n.category}</span>
                    <div className="row" style={{ gap: 2 }}>
                      <form action={insightFlagAction}>
                        <input type="hidden" name="id" value={n.id} />
                        <input type="hidden" name="flag" value="pinned" />
                        <input type="hidden" name="value" value={n.pinned ? "0" : "1"} />
                        <button className="btn btn-ghost btn-sm" type="submit" aria-pressed={Boolean(n.pinned)} title={n.pinned ? "Rimuovi da in evidenza" : "Metti in evidenza"}>
                          {n.pinned ? "★" : "☆"}
                        </button>
                      </form>
                      <form action={insightFlagAction}>
                        <input type="hidden" name="id" value={n.id} />
                        <input type="hidden" name="flag" value="done" />
                        <input type="hidden" name="value" value={n.done ? "0" : "1"} />
                        <button className="btn btn-ghost btn-sm" type="submit" title={n.done ? "Riapri" : "Segna come fatto"}>
                          {n.done ? "↺" : "✓"}
                        </button>
                      </form>
                    </div>
                  </div>
                  <h3 className="title-m">{n.title}</h3>
                  {n.body && <div className="body">{n.body}</div>}
                  <div className="row between xs faint" style={{ marginTop: "auto" }}>
                    <span>{n.author} · {fmtDate(n.updated_at)}</span>
                    {n.due_date && <span className={!n.done && n.due_date < t ? "delta-down" : ""}>Scadenza {fmtDate(n.due_date)}</span>}
                  </div>
                  <details className="disclosure">
                    <summary className="xs muted"><span className="chev">›</span> Modifica</summary>
                    <form action={updateInsightAction} className="stack mt">
                      <input type="hidden" name="id" value={n.id} />
                      <input className="input" name="title" defaultValue={n.title} aria-label="Titolo" />
                      <textarea className="input" name="body" defaultValue={n.body} aria-label="Testo" />
                      <div className="form-grid">
                        <select className="input" name="category" defaultValue={n.category} aria-label="Categoria">
                          {INSIGHT_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                        </select>
                        <input className="input" type="date" name="dueDate" defaultValue={n.due_date ?? ""} aria-label="Scadenza" />
                      </div>
                      <div className="row between">
                        <SubmitButton className="btn btn-sm">Salva</SubmitButton>
                        <ConfirmButton formAction={deleteInsightAction} message="Eliminare questa nota?">Elimina</ConfirmButton>
                      </div>
                    </form>
                  </details>
                </article>
              ))}
            </div>
          )}
        </div>

        <Card title="Nuova nota">
          <ActionForm action={addInsightAction} className="stack">
            <label className="field"><span>Titolo *</span><input className="input" name="title" required placeholder="Es. Pacchetto estivo per emergenti" /></label>
            <label className="field"><span>Dettagli</span><textarea className="input" name="body" rows={6} placeholder="Contesto, obiettivo, prossimi passi…" /></label>
            <div className="form-grid">
              <label className="field">
                <span>Categoria</span>
                <select className="input" name="category" defaultValue={category ?? "Strategia"}>
                  {INSIGHT_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                </select>
              </label>
              <label className="field"><span>Scadenza</span><input className="input" type="date" name="dueDate" /></label>
            </div>
            <SubmitButton pendingLabel="Salvo…">Aggiungi alla bacheca</SubmitButton>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
