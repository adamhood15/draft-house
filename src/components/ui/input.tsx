import type { InputHTMLAttributes } from "react";

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
};

/** docs/DESIGN.md §6: label above the field, 2px ink border, 6px radius, white fill. */
export function Input({ label, id, className = "", ...props }: InputProps) {
  const inputId = id ?? props.name;

  return (
    <div className="flex flex-col gap-1">
      <label
        htmlFor={inputId}
        className="text-[11px] font-bold uppercase tracking-wide text-ink/80"
      >
        {label}
      </label>
      <input
        {...props}
        id={inputId}
        className={`rounded-md border-2 border-ink bg-white px-3 py-2 text-sm text-ink placeholder:text-ink/40 focus:outline-none focus:ring-2 focus:ring-green focus:ring-offset-2 focus:ring-offset-background ${className}`}
      />
    </div>
  );
}
