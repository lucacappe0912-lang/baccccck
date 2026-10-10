"use client";
import { useState } from "react";

type Preset = { name: string; priceEur: number; items: [string, number][] };

/** Lets partners start from a preset bundle and then tweak quantities per service. */
export function PackagePresetPicker({ presets, services }: { presets: Preset[]; services: string[] }) {
  const empty = Object.fromEntries(services.map((s) => [s, 0])) as Record<string, number>;
  const [qty, setQty] = useState<Record<string, number>>(empty);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");

  const apply = (p: Preset) => {
    setQty({ ...empty, ...Object.fromEntries(p.items) });
    setName(p.name);
    setPrice(String(p.priceEur));
  };
  const total = Object.values(qty).reduce((a, b) => a + b, 0);

  return (
    <div className="stack">
      <div className="row-wrap">
        <span className="xs faint">Preset:</span>
        {presets.map((p) => (
          <button key={p.name} type="button" className="btn btn-sm" onClick={() => apply(p)}>{p.name}</button>
        ))}
      </div>
      <div className="form-grid">
        <label className="field"><span>Nome pacchetto</span><input className="input" name="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Pacchetto personalizzato" /></label>
        <label className="field"><span>Prezzo (€)</span><input className="input num" name="price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0" /></label>
      </div>
      <div className="checklist">
        {services.map((s) => (
          <label key={s} className="check" style={{ cursor: "default" }}>
            <span className="label grow">{s}</span>
            <input
              className="input num"
              type="number"
              min={0}
              max={50}
              name={`qty:${s}`}
              value={qty[s]}
              onChange={(e) => setQty((q) => ({ ...q, [s]: Math.max(0, Number(e.target.value) || 0) }))}
              style={{ width: 62, height: 30, textAlign: "center" }}
              aria-label={`Quantità ${s}`}
            />
          </label>
        ))}
        <div className="check" style={{ cursor: "default" }}>
          <input className="input" name="custom" placeholder="Altro servizio" style={{ height: 30 }} />
          <input className="input num" type="number" min={0} max={50} name="customQty" defaultValue={0} style={{ width: 62, height: 30, textAlign: "center" }} aria-label="Quantità servizio personalizzato" />
        </div>
      </div>
      <div className="xs faint">{total} servizi selezionati</div>
    </div>
  );
}
