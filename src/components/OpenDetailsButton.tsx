"use client";

/** Opens a collapsed <details> by id and scrolls to it (a plain #hash link can't open it). */
export function OpenDetailsButton({ target, children, className = "btn btn-sm btn-chrome" }: { target: string; children: React.ReactNode; className?: string }) {
  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        const el = document.getElementById(target);
        if (el instanceof HTMLDetailsElement) el.open = true;
        el?.scrollIntoView({ behavior: "smooth", block: "center" });
      }}
    >
      {children}
    </button>
  );
}
