/* eslint-disable @next/next/no-img-element */
// Official monogram: /public/logo.png (transparent cut-out of assets/logo-original.jpg).

export function LogoMark({ height = 34, className }: { height?: number; className?: string }) {
  return <img src="/logo.png" alt="" aria-hidden className={className} style={{ height, width: "auto" }} />;
}

/** Monogram + wordmark, used in the navigation header. */
export function Logo() {
  return (
    <span className="logo-lockup" aria-label="Backrooms Studio">
      <LogoMark height={34} />
      <span className="logo-word">
        <span className="chrome-text">BACKROOMS</span>
        <small>STUDIO</small>
      </span>
    </span>
  );
}
