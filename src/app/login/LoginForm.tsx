"use client";
import { useActionState } from "react";
import { login, type LoginState } from "./actions";
import { SubmitButton } from "@/components/SubmitButton";

export function LoginForm({ partners, next }: { partners: string[]; next: string }) {
  const [state, action] = useActionState<LoginState, FormData>(login, {});
  return (
    <form action={action} className="stack" style={{ gap: 16, textAlign: "left" }}>
      <input type="hidden" name="next" value={next} />
      <div className="field">
        <span>Chi sta entrando?</span>
        <div className="segmented" style={{ justifyContent: "center", width: "100%" }}>
          {partners.map((p, i) => (
            <label key={p} style={{ flex: 1, textAlign: "center" }}>
              <input type="radio" name="partner" value={p} defaultChecked={i === 0} />
              <span>{p}</span>
            </label>
          ))}
        </div>
      </div>
      <label className="field">
        <span>Password</span>
        <input className="input" type="password" name="password" autoComplete="current-password" required autoFocus />
      </label>
      {state.error && <div className="notice critical" role="alert">{state.error}</div>}
      <SubmitButton className="btn btn-chrome" style={{ height: 42, width: "100%" }} pendingLabel="Verifica…">
        Entra nell&apos;hub
      </SubmitButton>
    </form>
  );
}
