"use client";
import { useFormStatus } from "react-dom";

export function SubmitButton({
  children,
  className = "btn btn-chrome",
  pendingLabel,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { pendingLabel?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending || rest.disabled} aria-busy={pending} {...rest}>
      {pending ? (pendingLabel ?? "…") : children}
    </button>
  );
}
