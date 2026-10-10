"use client";
import { useActionState, useEffect, useRef } from "react";

type State = { ok?: string; error?: string };

/** Form bound to a server action returning {ok|error}; shows the outcome inline and resets on success. */
export function ActionForm({
  action,
  children,
  className,
  resetOnSuccess = true,
  encType,
}: {
  action: (prev: State, form: FormData) => Promise<State>;
  children: React.ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
  encType?: string;
}) {
  const [state, formAction] = useActionState(action, {});
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok && resetOnSuccess) ref.current?.reset();
  }, [state, resetOnSuccess]);
  return (
    <form ref={ref} action={formAction} className={className} encType={encType}>
      {children}
      {(state.ok || state.error) && (
        <div className={`notice ${state.ok ? "good" : "critical"}`} role="status" style={{ marginTop: 12 }}>
          {state.ok ?? state.error}
        </div>
      )}
    </form>
  );
}

/** One-click action button (e.g. "Sincronizza ora") with inline outcome. */
export function ActionButton({ action, children, className = "btn" }: { action: () => Promise<State>; children: React.ReactNode; className?: string }) {
  const [state, formAction, pending] = useActionState(async () => action(), {});
  return (
    <form action={formAction} style={{ display: "contents" }}>
      <button type="submit" className={className} disabled={pending} aria-busy={pending}>
        {pending ? "Sincronizzazione…" : children}
      </button>
      {(state.ok || state.error) && (
        <span className={`xs ${state.ok ? "delta-up" : "delta-down"}`} role="status" style={{ maxWidth: 360 }}>
          {state.ok ?? state.error}
        </span>
      )}
    </form>
  );
}
