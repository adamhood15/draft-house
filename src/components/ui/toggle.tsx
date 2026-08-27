/** docs/DESIGN.md §6: standard pill toggle — white/ink off, green fill + white knob on. */
export function Toggle({
  name,
  label,
  defaultChecked,
  checked,
  onChange,
}: {
  name: string;
  label: string;
  defaultChecked?: boolean;
  /** Pass checked+onChange for a controlled toggle (e.g. to drive other fields' state); omit for a plain uncontrolled one. */
  checked?: boolean;
  onChange?: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3">
      <span className="text-[11px] font-bold uppercase tracking-wide text-ink/80">{label}</span>
      <span className="relative inline-flex h-6 w-11 shrink-0 items-center">
        <input
          type="checkbox"
          name={name}
          defaultChecked={defaultChecked}
          checked={checked}
          onChange={onChange ? (e) => onChange(e.target.checked) : undefined}
          className="peer sr-only"
        />
        <span className="absolute inset-0 rounded-full border-2 border-ink bg-white transition-colors peer-checked:bg-green" />
        <span className="absolute left-0.5 h-4 w-4 rounded-full bg-ink transition-transform peer-checked:translate-x-5 peer-checked:bg-white" />
      </span>
    </label>
  );
}
