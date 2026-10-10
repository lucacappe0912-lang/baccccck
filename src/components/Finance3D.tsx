"use client";
import { Canvas, useFrame } from "@react-three/fiber";
import { Environment, Html, Lightformer, OrbitControls, RoundedBox } from "@react-three/drei";
import { createContext, useContext, useMemo, useRef, useState } from "react";
import * as THREE from "three";

export type MonthDatum = { month: number; income: number; expenses: number; profit: number; margin: number | null };

const SERIES = [
  { key: "income", label: "Entrate", color: "#3987e5" },
  { key: "expenses", label: "Uscite", color: "#d95926" },
  { key: "profit", label: "Utile / Perdita", color: "#9085e9" },
] as const;
type SeriesKey = (typeof SERIES)[number]["key"];

const MONTHS = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];
const eur = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const money = (cents: number) => eur.format(cents / 100);

// All <Html> overlays render into one stable container we own. Without it drei picks
// the canvas parent or the R3F event source depending on timing, and unmounting
// (mode switch, hover end, navigation) can try to remove the node from the wrong parent.
const PortalCtx = createContext<React.RefObject<HTMLDivElement | null> | null>(null);
function usePortal() {
  return useContext(PortalCtx) as React.RefObject<HTMLElement>;
}

const SPACING = 1.55;
const BAR_W = 0.34;
const GAP = 0.05;
const MAX_H = 4.2;

function Bar({ x, height, color, highlighted, delay }: { x: number; height: number; color: string; highlighted: boolean; delay: number }) {
  const ref = useRef<THREE.Group>(null);
  const t = useRef(0);
  useFrame((_, dt) => {
    t.current += dt;
    if (!ref.current) return;
    const progress = Math.min(1, Math.max(0, (t.current - delay) / 0.9));
    const eased = 1 - Math.pow(1 - progress, 3);
    const target = Math.max(0.0001, eased);
    ref.current.scale.y += (target - ref.current.scale.y) * 0.25;
  });
  if (height === 0) return null; // future / empty months: no stub
  const h = Math.max(Math.abs(height), 0.02);
  const sign = height < 0 ? -1 : 1;
  return (
    <group ref={ref} position={[x, 0, 0]} scale={[1, 0.0001, 1]}>
      <RoundedBox args={[BAR_W, h, BAR_W]} radius={0.05} smoothness={4} position={[0, (sign * h) / 2, 0]}>
        <meshPhysicalMaterial
          color={color}
          metalness={0.75}
          roughness={0.2}
          clearcoat={1}
          clearcoatRoughness={0.08}
          envMapIntensity={1.4}
          emissive={color}
          emissiveIntensity={highlighted ? 0.45 : 0.06}
        />
      </RoundedBox>
    </group>
  );
}

function Floor({ width }: { width: number }) {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.001, 0]}>
        <planeGeometry args={[width + 4, 5]} />
        <meshPhysicalMaterial color="#0d0d10" metalness={0.9} roughness={0.35} transparent opacity={0.75} />
      </mesh>
      <gridHelper args={[width + 4, Math.round(width + 4), "#2a2a2e", "#18181b"]} position={[0, 0.001, 0]} />
    </group>
  );
}

function Bars({ data, visible, hover, setHover, scale }: {
  data: MonthDatum[];
  visible: Record<SeriesKey, boolean>;
  hover: number | null;
  setHover: (i: number | null) => void;
  scale: number;
}) {
  const portal = usePortal();
  const active = SERIES.filter((s) => visible[s.key]);
  const groupW = active.length * BAR_W + (active.length - 1) * GAP;
  const offset = ((data.length - 1) * SPACING) / 2;
  return (
    <>
      {data.map((d, i) => {
        const gx = i * SPACING - offset;
        return (
          <group key={d.month} position={[gx, 0, 0]}>
            {active.map((s, j) => (
              <Bar
                key={s.key}
                x={-groupW / 2 + BAR_W / 2 + j * (BAR_W + GAP)}
                height={d[s.key] * scale}
                color={s.color}
                highlighted={hover === i}
                delay={i * 0.04 + j * 0.05}
              />
            ))}
            {/* Hit target larger than the marks */}
            <mesh
              position={[0, 0.5, 0]}
              onPointerOver={(e) => {
                e.stopPropagation();
                setHover(i);
              }}
              onPointerOut={() => setHover(null)}
            >
              <boxGeometry args={[SPACING * 0.95, MAX_H * 2.2, 1.2]} />
              <meshBasicMaterial transparent opacity={0} depthWrite={false} />
            </mesh>
            <Html portal={portal} position={[0, -0.05, 0.95]} center className="month-label" zIndexRange={[1, 0]}>
              {MONTHS[d.month - 1]}
            </Html>
            {hover === i && (
              <Html portal={portal} position={[0, Math.max(0.6, d.income * scale, d.expenses * scale, d.profit * scale) + 0.5, 0]} center zIndexRange={[20, 10]}>
                <Tooltip d={d} />
              </Html>
            )}
          </group>
        );
      })}
    </>
  );
}

function Tooltip({ d }: { d: MonthDatum }) {
  return (
    <div className="chart-tip">
      <div style={{ fontWeight: 600, marginBottom: 6 }}>{MONTHS[d.month - 1]}</div>
      {SERIES.map((s) => (
        <div className="r" key={s.key}>
          <span className="muted">
            <i style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: s.color, marginRight: 6 }} />
            {s.label}
          </span>
          <span>{money(d[s.key])}</span>
        </div>
      ))}
      <div className="r" style={{ marginTop: 4, paddingTop: 4, borderTop: "1px solid rgba(255,255,255,.1)" }}>
        <span className="muted">Margine</span>
        <span>{d.margin === null ? "—" : `${(d.margin * 100).toFixed(1).replace(".", ",")}%`}</span>
      </div>
    </div>
  );
}

/** Cumulative cash-flow as a chrome ribbon (single series, single axis). */
function CashRibbon({ data, hover, setHover }: { data: MonthDatum[]; hover: number | null; setHover: (i: number | null) => void }) {
  const portal = usePortal();
  const cumulative = useMemo(() => {
    let acc = 0;
    return data.map((d) => (acc += d.profit));
  }, [data]);
  const maxAbs = Math.max(1, ...cumulative.map(Math.abs));
  const s = MAX_H / maxAbs;
  const offset = ((data.length - 1) * SPACING) / 2;
  const points = useMemo(() => cumulative.map((v, i) => new THREE.Vector3(i * SPACING - offset, v * s, 0)), [cumulative, s, offset]);
  const curve = useMemo(() => new THREE.CatmullRomCurve3(points, false, "centripetal"), [points]);
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (ref.current) ref.current.rotation.x = Math.sin(clock.elapsedTime * 0.4) * 0.02;
  });
  return (
    <>
      <mesh ref={ref}>
        <tubeGeometry args={[curve, 200, 0.07, 24, false]} />
        <meshPhysicalMaterial color="#e8ebef" metalness={1} roughness={0.08} clearcoat={1} envMapIntensity={2} />
      </mesh>
      {points.map((p, i) => (
        <group key={i} position={p}>
          <mesh
            onPointerOver={(e) => {
              e.stopPropagation();
              setHover(i);
            }}
            onPointerOut={() => setHover(null)}
          >
            <sphereGeometry args={[hover === i ? 0.2 : 0.14, 32, 32]} />
            <meshPhysicalMaterial
              color={cumulative[i] >= 0 ? "#9085e9" : "#d95926"}
              metalness={0.8}
              roughness={0.15}
              clearcoat={1}
              emissive={cumulative[i] >= 0 ? "#9085e9" : "#d95926"}
              emissiveIntensity={hover === i ? 0.6 : 0.15}
            />
          </mesh>
          <Html portal={portal} position={[0, -p.y - 0.05, 0.75]} center className="month-label" zIndexRange={[1, 0]}>
            {MONTHS[data[i].month - 1]}
          </Html>
          {hover === i && (
            <Html portal={portal} position={[0, 0.6, 0]} center zIndexRange={[20, 10]}>
              <div className="chart-tip">
                <div style={{ fontWeight: 600, marginBottom: 6 }}>Fine {MONTHS[data[i].month - 1]}</div>
                <div className="r"><span className="muted">Cassa cumulata</span><span>{money(cumulative[i])}</span></div>
                <div className="r"><span className="muted">Flusso del mese</span><span>{money(data[i].profit)}</span></div>
              </div>
            </Html>
          )}
        </group>
      ))}
    </>
  );
}

function Studio() {
  // Procedural studio lighting (no external HDR download) → liquid-chrome reflections.
  return (
    <Environment resolution={256}>
      <group rotation={[-Math.PI / 3, 0, 1]}>
        <Lightformer form="rect" intensity={4} position={[0, 5, -9]} scale={[10, 1, 1]} />
        <Lightformer form="rect" intensity={2} position={[-5, 1, -1]} rotation-y={Math.PI / 2} scale={[20, 0.5, 1]} />
        <Lightformer form="rect" intensity={2} position={[-5, -1, -1]} rotation-y={Math.PI / 2} scale={[20, 0.5, 1]} />
        <Lightformer form="rect" intensity={2} position={[10, 1, 0]} rotation-y={-Math.PI / 2} scale={[20, 1, 1]} />
        <Lightformer form="ring" color="#9085e9" intensity={1.5} position={[0, 4, 6]} scale={3} />
      </group>
    </Environment>
  );
}

export default function Finance3D({ data }: { data: MonthDatum[] }) {
  const [mode, setMode] = useState<"pl" | "cash">("pl");
  const [hover, setHover] = useState<number | null>(null);
  const overlay = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState<Record<SeriesKey, boolean>>({ income: true, expenses: true, profit: true });

  const maxAbs = Math.max(1, ...data.flatMap((d) => SERIES.filter((s) => visible[s.key]).map((s) => Math.abs(d[s.key]))));
  const scale = MAX_H / maxAbs;
  const width = (data.length - 1) * SPACING;
  const hasData = data.some((d) => d.income || d.expenses);

  return (
    <div>
      <div className="row-wrap between" style={{ marginBottom: 14 }}>
        <div className="segmented" role="tablist">
          <button type="button" aria-current={mode === "pl"} onClick={() => setMode("pl")}>Profitti & Perdite</button>
          <button type="button" aria-current={mode === "cash"} onClick={() => setMode("cash")}>Flusso di cassa cumulato</button>
        </div>
        {mode === "pl" ? (
          <div className="legend" aria-label="Legenda (clicca per mostrare/nascondere)">
            {SERIES.map((s) => (
              <button
                key={s.key}
                type="button"
                aria-pressed={visible[s.key]}
                onClick={() => setVisible((v) => ({ ...v, [s.key]: !v[s.key] }))}
              >
                <i style={{ background: s.color }} />
                {s.label}
              </button>
            ))}
          </div>
        ) : (
          <div className="legend"><span><i style={{ background: "linear-gradient(#fff,#8d939b)" }} />Saldo progressivo dell&apos;anno</span></div>
        )}
      </div>
      <div className="chart3d" role="img" aria-label="Grafico 3D mensile di entrate, uscite e utile. I valori sono riportati anche nella tabella mensile.">
        {!hasData && (
          <div className="empty" style={{ position: "absolute", inset: 0, display: "grid", placeContent: "center", zIndex: 2, pointerEvents: "none" }}>
            <h4>Nessun movimento per quest&apos;anno</h4>
            <div className="small">Collega la banca o registra un movimento in contanti.</div>
          </div>
        )}
        <div ref={overlay} style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 1 }} />
        <PortalCtx.Provider value={overlay}>
        <Canvas camera={{ position: [0, 3.4, 12], fov: 42 }} dpr={[1, 2]} gl={{ antialias: true, alpha: true }}>
          <ambientLight intensity={0.25} />
          <directionalLight position={[6, 10, 6]} intensity={1.1} />
          <Studio />
          <group position={[0, mode === "pl" ? -1.5 : -1.2, 0]}>
            <Floor width={width} />
            {mode === "pl" ? (
              <Bars data={data} visible={visible} hover={hover} setHover={setHover} scale={scale} />
            ) : (
              <CashRibbon data={data} hover={hover} setHover={setHover} />
            )}
          </group>
          <OrbitControls
            enablePan={false}
            enableZoom={false}
            minPolarAngle={0.75}
            maxPolarAngle={1.5}
            minAzimuthAngle={-0.7}
            maxAzimuthAngle={0.7}
            enableDamping
          />
        </Canvas>
        </PortalCtx.Provider>
      </div>
      <div className="xs faint" style={{ marginTop: 8 }}>Trascina per ruotare · passa sopra un mese per i dettagli</div>
    </div>
  );
}
