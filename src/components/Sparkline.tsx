"use client";
import { useState } from "react";

const fmt = new Intl.NumberFormat("it-IT");

/** 2px trend line with crosshair + tooltip. Gaps (null) break the line instead of faking zeros. */
export function Sparkline({
  values,
  dates,
  label,
  pct = false,
  color = "#c9ced6",
}: {
  values: (number | null)[];
  dates: string[];
  label: string;
  pct?: boolean;
  color?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 300;
  const H = 44;
  const nums = values.filter((v): v is number => v !== null);
  if (nums.length < 2) return <div className="xs faint" style={{ marginTop: 10, height: 44 }}>Storico insufficiente per il trend</div>;
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const x = (i: number) => (i / (values.length - 1)) * W;
  const y = (v: number) => H - 3 - ((v - min) / (max - min || 1)) * (H - 6);

  let d = "";
  values.forEach((v, i) => {
    if (v === null) return;
    d += `${i > 0 && values[i - 1] !== null ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)} `;
  });
  const show = (v: number) => (pct ? `${(v * 100).toFixed(1).replace(".", ",")}%` : fmt.format(Math.round(v)));
  const hv = hover !== null ? values[hover] : null;

  return (
    <div style={{ position: "relative" }}>
      <svg
        className="spark"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`Andamento ${label} ultimi ${values.length} giorni`}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const i = Math.round(((e.clientX - rect.left) / rect.width) * (values.length - 1));
          setHover(Math.max(0, Math.min(values.length - 1, i)));
        }}
      >
        <path d={d} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
        {hover !== null && (
          <line x1={x(hover)} x2={x(hover)} y1="0" y2={H} stroke="rgba(255,255,255,.25)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        )}
        {hover !== null && hv !== null && (
          <circle cx={x(hover)} cy={y(hv)} r="4" fill={color} stroke="#0b0b0d" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        )}
      </svg>
      {hover !== null && (
        <div
          className="chart-tip"
          style={{
            position: "absolute",
            bottom: 52,
            left: `${(hover / (values.length - 1)) * 100}%`,
            transform: `translateX(${hover > values.length / 2 ? "-100%" : "0"})`,
            minWidth: 0,
            zIndex: 5,
          }}
        >
          <div className="faint xs">{new Date(`${dates[hover]}T12:00:00`).toLocaleDateString("it-IT", { day: "numeric", month: "short" })}</div>
          <div className="num" style={{ fontWeight: 600 }}>{hv === null ? "nessun dato" : show(hv)}</div>
        </div>
      )}
    </div>
  );
}
