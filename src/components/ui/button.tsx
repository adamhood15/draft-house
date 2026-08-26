"use client";

import { useFormStatus } from "react-dom";
import type { ButtonHTMLAttributes } from "react";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary";
};

const base =
  "inline-flex items-center justify-center gap-2 rounded-lg border-2 border-ink px-4 py-2 text-sm font-bold uppercase tracking-wide shadow-[3px_3px_0_var(--ink)] transition-transform hover:-translate-y-0.5 hover:shadow-[4px_4px_0_var(--ink)] active:translate-y-0.5 active:shadow-[1px_1px_0_var(--ink)] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:shadow-[3px_3px_0_var(--ink)]";

const variants = {
  primary: "bg-green text-white",
  secondary: "bg-background text-ink",
};

/** docs/DESIGN.md §6: 2px ink border, hard offset shadow, filled green for primary actions. */
export function Button({ variant = "primary", className = "", ...props }: ButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button
      {...props}
      disabled={pending || props.disabled}
      className={`${base} ${variants[variant]} ${className}`}
    >
      {pending ? "Please wait…" : props.children}
    </button>
  );
}
