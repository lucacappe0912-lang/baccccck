import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { listSessions, occupancyHeatmap, pendingItems, saturation, weekStart, type Session } from "@/lib/business";
import { listArtists } from "@/lib/crm";
import { partners } from "@/lib/partners";
import { getSettings, WEEKDAYS } from "@/lib/settings";
import { addDays, fmtPct, isoDate, today } from "@/lib/format";
import { Card, Empty, PageHead, Stat } from "@/components/ui";
import { ActionForm } from "@/components/ActionForm";
import { SubmitButton } from "@/components/SubmitButton";
import { ConfirmButton } from "@/components/ConfirmButton";
import { addSessionAction, deleteSessionAction, sessionStatusAction } from "../actions";

export const metadata = { title: "Agenda" };

const minutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const ROOM_COLORS = ["var(--room-1)", "var(--room-2)", "var(--room-3)", "var(--room-4)"];
const STATUS_BADGE: Record<Session["status"], string> = { prenotata: "info", completata: "good", annullata: "plain" };

export default async function AgendaPage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const { partner } = await requireSession();
  const sp = await searchParams;
  const settings = getSettings();
  const t = today();
  const week = weekStart(/^\d{4}-\d{2}-\d{2}$/.test(sp.week ?? "") ? sp.week! : t);
  const days = Array.from({ length: 7 }, (_, i) => addDays(week, i));
  const sessions = listSessions(week, addDays(week, 6));
  const shownDays = days.filter((d, i) => settings.openDays.includes(i + 1) || sessions.some((s) => s.date === d));
  const weekSat = saturation(week, addDays(week, 6), settings);
  const now = new Date();
  const monthSat = saturation(isoDate(new Date(now.getFullYear(), now.getMonth(), 1)), isoDate(new Date(now.getFullYear(), now.getMonth() + 1, 0)), settings);
  const heat = occupancyHeatmap(8, settings);
  const items = pendingItems();
  const artists = listArtists();
  const roomColor = (room: string) => ROOM_COLORS[Math.max(0, settings.rooms.indexOf(room)) % ROOM_COLORS.length];
  const open = settings.openHour * 60;
  const HOUR = 44;
  const upcoming = sessions.filter((s) => s.status === "prenotata" && s.date >= t);
  const emptySlots = heat.days
    .flatMap((d) => heat.hours.map((h) => ({ d, h, r: heat.rate(d, h) })))
    .filter((x) => x.r < 0.15).length;

  return (
    <>
      <PageHead
        eyebrow="Sale & sessioni"
        title="Agenda"
        intro="Prenotazioni per sala e fonico. Quando una sessione collegata a un pacchetto viene completata, il servizio si spunta da solo."
        actions={
          <div className="segmented">
            <Link href={`/agenda?week=${addDays(week, -7)}`}>‹ Settimana prima</Link>
            <Link href="/agenda" aria-current={week === weekStart(t)}>Questa settimana</Link>
            <Link href={`/agenda?week=${addDays(week, 7)}`}>Dopo ›</Link>
          </div>
        }
      />

      <div className="grid cols-4">
        <Stat label="Saturazione settimana" value={fmtPct(weekSat.rate)} sub={`${weekSat.booked.toFixed(1).replace(".", ",")} h prenotate su ${weekSat.capacity} h disponibili`}>
          <div className="meter" style={{ marginTop: 10 }}><i style={{ width: `${Math.min(100, weekSat.rate * 100)}%` }} /></div>
        </Stat>
        <Stat label="Saturazione del mese" value={fmtPct(monthSat.rate)} sub={`${Math.round(monthSat.capacity - monthSat.booked)} ore di sala ancora vendibili`} />
        <Stat label="Sessioni in arrivo" value={upcoming.length} sub="da oggi a fine settimana" />
        <Stat label="Fasce quasi sempre vuote" value={emptySlots} sub="ore/settimana sotto il 15% di occupazione" />
      </div>

      <Card className="mt" flush title={`Settimana dal ${new Date(`${week}T12:00:00`).toLocaleDateString("it-IT", { day: "numeric", month: "long" })}`}
        actions={<div className="legend">{settings.rooms.map((r) => <span key={r}><i style={{ background: roomColor(r) }} />{r}</span>)}</div>}>
        <div className="week-scroll" style={{ padding: "8px 12px 16px" }}>
          <div className="week" style={{ ["--days" as string]: shownDays.length, ["--hour-h" as string]: `${HOUR}px` }}>
            <div />
            {shownDays.map((d) => {
              const i = days.indexOf(d);
              return (
                <div key={d} className={`week-head ${d === t ? "today" : ""}`}>
                  <span>{WEEKDAYS[i]} {Number(d.slice(8))}</span>
                </div>
              );
            })}
            <div className="hours-col" style={{ paddingTop: 0 }}>
              {Array.from({ length: settings.closeHour - settings.openHour }, (_, i) => <div key={i}>{settings.openHour + i}:00</div>)}
            </div>
            {shownDays.map((d) => {
              const dow = days.indexOf(d) + 1;
              return (
                <div key={d} className={`day-col ${settings.openDays.includes(dow) ? "" : "closed"}`} style={{ height: (settings.closeHour - settings.openHour) * HOUR }}>
                  {sessions.filter((s) => s.date === d).map((s) => {
                    const rooms = settings.rooms.length;
                    const ri = Math.max(0, settings.rooms.indexOf(s.room));
                    const top = ((minutes(s.start_time) - open) / 60) * HOUR;
                    const h = Math.max(22, ((minutes(s.end_time) - minutes(s.start_time)) / 60) * HOUR - 2);
                    return (
                      <a
                        key={s.id}
                        href={`#sessione-${s.id}`}
                        className={`slot ${s.status === "completata" ? "done" : s.status === "annullata" ? "cancelled" : ""}`}
                        style={{ ["--c" as string]: roomColor(s.room), top, height: h, left: `calc(${(ri / rooms) * 100}% + 3px)`, right: `calc(${((rooms - ri - 1) / rooms) * 100}% + 3px)` }}
                        title={`${s.start_time}–${s.end_time} · ${s.room} · ${s.artist_name ?? s.title}`}
                      >
                        <span className="t">{s.start_time}{s.status === "completata" ? " ✓" : ""}</span>
                        <b>{s.artist_name ?? (s.title || "Sessione")}</b>
                        {h > 50 && <span className="t">{s.service ?? s.title} · {s.engineer}</span>}
                      </a>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </Card>

      <div className="grid cols-3 mt" style={{ alignItems: "start" }}>
        <Card className="span-2" flush title="Sessioni della settimana">
          {sessions.length === 0 ? (
            <Empty glyph="◷" title="Nessuna sessione in questa settimana">Prenota la prima dal modulo qui accanto.</Empty>
          ) : (
            <div className="table-wrap" style={{ marginTop: 8 }}>
              <table className="table">
                <thead><tr><th>Quando</th><th>Artista / servizio</th><th>Sala · fonico</th><th>Stato</th><th></th></tr></thead>
                <tbody>
                  {sessions.map((s) => (
                    <tr key={s.id} id={`sessione-${s.id}`} style={{ scrollMarginTop: 90 }}>
                      <td className="num" style={{ whiteSpace: "nowrap" }}>
                        {WEEKDAYS[(new Date(`${s.date}T12:00:00`).getDay() + 6) % 7]} {Number(s.date.slice(8))}<div className="xs faint">{s.start_time}–{s.end_time}</div>
                      </td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{s.artist_name ?? (s.title || "Sessione")}</div>
                        <div className="xs faint">{s.service ? `Dal pacchetto: ${s.service}` : s.title || "Fuori pacchetto"}</div>
                      </td>
                      <td className="small"><span className="legend"><span><i style={{ background: roomColor(s.room) }} />{s.room}</span></span><div className="xs faint">{s.engineer || "—"}</div></td>
                      <td><span className={`badge ${STATUS_BADGE[s.status]}`}>{s.status}</span></td>
                      <td className="right" style={{ whiteSpace: "nowrap" }}>
                        {s.status === "prenotata" && (
                          <>
                            <form action={sessionStatusAction} style={{ display: "inline" }}>
                              <input type="hidden" name="id" value={s.id} /><input type="hidden" name="status" value="completata" />
                              <SubmitButton className="btn btn-sm">✓ Completata</SubmitButton>
                            </form>
                            <form action={sessionStatusAction} style={{ display: "inline" }}>
                              <input type="hidden" name="id" value={s.id} /><input type="hidden" name="status" value="annullata" />
                              <SubmitButton className="btn btn-ghost btn-sm">Annulla</SubmitButton>
                            </form>
                          </>
                        )}
                        {s.status !== "prenotata" && (
                          <form action={sessionStatusAction} style={{ display: "inline" }}>
                            <input type="hidden" name="id" value={s.id} /><input type="hidden" name="status" value="prenotata" />
                            <SubmitButton className="btn btn-ghost btn-sm">Ripristina</SubmitButton>
                          </form>
                        )}
                        <form action={deleteSessionAction} style={{ display: "inline" }}>
                          <input type="hidden" name="id" value={s.id} />
                          <ConfirmButton message="Eliminare questa sessione?" aria-label="Elimina sessione">✕</ConfirmButton>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title="Prenota una sessione">
          <ActionForm action={addSessionAction} className="stack">
            <div className="form-grid">
              <label className="field"><span>Giorno</span><input className="input" type="date" name="date" defaultValue={t < week ? week : t} required /></label>
              <label className="field"><span>Sala</span>
                <select className="input" name="room">{settings.rooms.map((r) => <option key={r}>{r}</option>)}</select>
              </label>
            </div>
            <div className="form-grid">
              <label className="field"><span>Inizio</span><input className="input" type="time" name="start" defaultValue="15:00" step={900} required /></label>
              <label className="field"><span>Fine</span><input className="input" type="time" name="end" defaultValue="18:00" step={900} required /></label>
            </div>
            <label className="field"><span>Servizio del pacchetto</span>
              <select className="input" name="itemId" defaultValue="">
                <option value="">— Nessuno (sessione fuori pacchetto) —</option>
                {[...new Set(items.map((i) => i.artist_name))].map((name) => (
                  <optgroup key={name} label={name}>
                    {items.filter((i) => i.artist_name === name).map((i) => <option key={i.id} value={i.id}>{i.service}</option>)}
                  </optgroup>
                ))}
              </select>
            </label>
            <label className="field"><span>Artista (se fuori pacchetto)</span>
              <select className="input" name="artistId" defaultValue="">
                <option value="">—</option>
                {artists.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </label>
            <div className="form-grid">
              <label className="field"><span>Fonico</span>
                <select className="input" name="engineer" defaultValue={partner}>{partners().map((p) => <option key={p}>{p}</option>)}</select>
              </label>
              <label className="field"><span>Nota</span><input className="input" name="title" placeholder="Es. provino voce" /></label>
            </div>
            <SubmitButton pendingLabel="Prenoto…">Prenota</SubmitButton>
          </ActionForm>
        </Card>
      </div>

      <Card className="mt" title="Fasce orarie: occupazione media delle ultime 8 settimane"
        actions={<span className="xs faint">0%<span className="legend-ramp" />100%</span>}>
        <div className="table-wrap">
          <div className="heat" style={{ gridTemplateColumns: `44px repeat(${heat.hours.length}, minmax(26px, 1fr))`, minWidth: 44 + heat.hours.length * 29 }}>
            <div />
            {heat.hours.map((h) => <div key={h} className="lbl" style={{ justifyContent: "center" }}>{h}</div>)}
            {heat.days.map((d) => (
              <div key={d} style={{ display: "contents" }}>
                <div className="lbl">{WEEKDAYS[d]}</div>
                {heat.hours.map((h) => {
                  const r = heat.rate(d, h);
                  return <div key={h} className="cell" style={{ ["--a" as string]: 0.05 + r * 0.95 }} title={`${WEEKDAYS[d]} ${h}:00 · occupata ${Math.round(r * 100)}% delle volte`} />;
                })}
              </div>
            ))}
          </div>
        </div>
        <p className="xs faint" style={{ marginBottom: 0 }}>Le celle chiare sono le ore che restano libere: buone candidate per tariffe scontate o sessioni promozionali.</p>
      </Card>
    </>
  );
}
