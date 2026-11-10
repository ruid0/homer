import { useId } from "react";
import { copy } from "../copy";

type Props = { label: string; value: string; min: number; max: number; onChange: (value: string) => void };

const side =
  "grid size-11 place-items-center border border-control bg-card text-xl transition-transform hover:bg-hover active:scale-[0.97] disabled:active:scale-100 focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-50";

// A number with a big minus and plus either side, for thumbs. The number stays a real number box, so it can still be typed into.
export const Stepper = ({ label, value, min, max, onChange }: Props) => {
  const labelId = useId();
  // An empty or invalid box counts as nothing typed: either button then steps from the lowest number.
  const count = value.trim() === "" ? Number.NaN : Number(value);
  const step = (by: number) => onChange(String(Math.min(max, Math.max(min, (Number.isFinite(count) ? count : min) + by))));
  return (
    <div className="grid gap-1">
      <span id={labelId}>{label}</span>
      <div className="flex">
        <button type="button" className={`${side} rounded-l-lg`} aria-label={copy.maintenance.lessLabel} disabled={count <= min} onClick={() => step(-1)}>−</button>
        <input
          type="number"
          inputMode="numeric"
          aria-labelledby={labelId}
          min={min}
          max={max}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-11 w-12 min-w-0 border-y border-control bg-card text-center text-answer font-semibold [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
        <button type="button" className={`${side} rounded-r-lg`} aria-label={copy.maintenance.moreLabel} disabled={count >= max} onClick={() => step(1)}>+</button>
      </div>
    </div>
  );
};
