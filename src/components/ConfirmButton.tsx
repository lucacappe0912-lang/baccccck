"use client";

/** Submit button that asks for confirmation before destructive actions. */
export function ConfirmButton({ message, children, className = "btn btn-ghost btn-sm btn-danger", ...rest }:
  React.ButtonHTMLAttributes<HTMLButtonElement> & { message: string }) {
  return (
    <button
      type="submit"
      className={className}
      onClick={(e) => {
        if (!confirm(message)) e.preventDefault();
      }}
      {...rest}
    >
      {children}
    </button>
  );
}
