"use client";
import dynamic from "next/dynamic";
import type { MonthDatum } from "./Finance3D";

const Finance3D = dynamic(() => import("./Finance3D"), {
  ssr: false,
  loading: () => <div className="chart3d" style={{ display: "grid", placeItems: "center" }}><span className="faint small">Caricamento grafico 3D…</span></div>,
});

export function Finance3DLazy({ data }: { data: MonthDatum[] }) {
  return <Finance3D data={data} />;
}
