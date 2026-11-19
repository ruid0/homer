type Props = { label: string; name: string; value: string; options: readonly { value: string; label: string }[]; onChange: (value: string) => void };

// A few choices side by side where all of them show at once. Real radio buttons, so the arrow keys move between them.
export const SegmentedChoice = ({ label, name, value, options, onChange }: Props) => (
  <fieldset className="m-0 grid min-w-[11.5rem] flex-1 gap-1 border-0 p-0">
    <legend className="mb-1 p-0">{label}</legend>
    <div className="flex min-w-0">
      {options.map((option, index) => (
        <label
          key={option.value}
          className={`relative -ml-px flex h-11 min-w-0 flex-auto cursor-pointer items-center justify-center border border-control px-2 capitalize text-base font-medium first:ml-0 has-[:focus-visible]:z-10 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ink ${
            index === 0 ? "rounded-l-lg" : ""
          } ${index === options.length - 1 ? "rounded-r-lg" : ""} ${
            option.value === value ? "z-[1] border-primary bg-primary font-semibold text-on-primary" : "bg-card hover:bg-hover"
          }`}
        >
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={option.value === value}
            onChange={() => onChange(option.value)}
            className="absolute inset-0 size-full cursor-pointer opacity-0"
          />
          {option.label}
        </label>
      ))}
    </div>
  </fieldset>
);
