import type { ButtonHTMLAttributes, ReactNode } from "react";

type PrimaryButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
};

export function PrimaryButton({
  children,
  className = "",
  ...props
}: PrimaryButtonProps) {
  return (
    <button
      className={`inline-flex items-center justify-center rounded-2xl bg-[var(--klubi-primary)] px-6 py-3 text-sm font-semibold text-[var(--klubi-secondary)] shadow-[0_8px_24px_rgba(255,184,0,0.32)] transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
