/* eslint-disable @next/next/no-img-element */
// Official logo lives in /public/logo.svg — replace that file to update the brand everywhere.
export function Logo({ className, height = 30 }: { className?: string; height?: number }) {
  return <img src="/logo.svg" alt="Backrooms Studio" className={className} style={{ height }} />;
}
