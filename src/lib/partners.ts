export function partners(): string[] {
  const list = (process.env.PARTNERS ?? "Socio 1,Socio 2,Socio 3")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  return list.length ? list : ["Socio 1", "Socio 2", "Socio 3"];
}
