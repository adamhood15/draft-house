import type { SelectHTMLAttributes } from "react";

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
};

/** Same field-wrapper conventions as Input (docs/DESIGN.md §6) — label above, 2px ink border. */
export function Select({ label, id, name, className = "", ...props }: SelectProps) {
  const selectId = id ?? name;

  return (
    <div className="flex flex-col gap-1">
      <label
        htmlFor={selectId}
        className="text-[11px] font-bold uppercase tracking-wide text-ink/80"
      >
        {label}
      </label>
      <select
        {...props}
        id={selectId}
        name={name}
        className={`rounded-md border-2 border-ink bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-green focus:ring-offset-2 focus:ring-offset-background ${className}`}
      />
    </div>
  );
}
