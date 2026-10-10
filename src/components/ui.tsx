import type { ReactNode } from "react";

export function PageHead({ eyebrow, title, intro, actions }: { eyebrow?: string; title: string; intro?: string; actions?: ReactNode }) {
  return (
    <header className="page-head">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1 className="title-xl chrome-text" style={{ marginTop: eyebrow ? 8 : 0 }}>
          {title}
        </h1>
        {intro && <p>{intro}</p>}
      </div>
      {actions && <div className="row-wrap">{actions}</div>}
    </header>
  );
}

export function Card({ title, actions, children, className = "", flush }: {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  flush?: boolean;
}) {
  return (
    <section className={`card ${flush ? "flush" : ""} ${className}`}>
      {(title || actions) && (
        <div className="card-head" style={flush ? { padding: "20px 22px 0" } : undefined}>
          {typeof title === "string" ? <h3>{title}</h3> : title}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, sub, children }: { label: string; value: ReactNode; sub?: ReactNode; children?: ReactNode }) {
  return (
    <div className="card stat">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {sub && <div className="sub">{sub}</div>}
      {children}
    </div>
  );
}

export function Empty({ glyph = "◌", title, children }: { glyph?: string; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <div className="glyph" aria-hidden>
        {glyph}
      </div>
      <h4>{title}</h4>
      {children && <div className="small">{children}</div>}
    </div>
  );
}

/** Delta vs previous period, with arrow + sign so it never relies on colour alone. */
export function Delta({ current, previous, invert = false }: { current: number; previous: number | null; invert?: boolean }) {
  if (previous === null || previous === 0) return null;
  const change = (current - previous) / Math.abs(previous);
  const good = invert ? change < 0 : change > 0;
  return (
    <span className={good ? "delta-up" : change === 0 ? "" : "delta-down"}>
      {change > 0 ? "▲" : change < 0 ? "▼" : "•"} {Math.abs(change * 100).toFixed(1).replace(".", ",")}%
    </span>
  );
}

export function Ring({ value, total, size = 64 }: { value: number; total: number; size?: number }) {
  const r = size / 2 - 5;
  const c = 2 * Math.PI * r;
  const pct = total ? value / total : 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${value} su ${total}`}>
      <defs>
        <linearGradient id="ring-chrome" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f4f6f8" />
          <stop offset=".35" stopColor="#8d939b" />
          <stop offset=".6" stopColor="#eef0f2" />
          <stop offset="1" stopColor="#a3a9b1" />
        </linearGradient>
      </defs>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="5" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="url(#ring-chrome)"
        strokeWidth="5"
        strokeLinecap="round"
        strokeDasharray={`${c * pct} ${c}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" fill="#f5f5f7" fontSize={size / 4.2} fontWeight="650">
        {total - value}
      </text>
    </svg>
  );
}
