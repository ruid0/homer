type Props = { chips: string[] };

// Facts about a job (how often, when last done): quiet outlines, so they read as detail next to the status line.
export const UpkeepChips = ({ chips }: Props) => (
  <ul className="flex flex-wrap gap-1.5">
    {chips.map((chip) => (
      <li key={chip} className="rounded-full border border-line-strong px-2.5 text-meta text-muted">
        {chip}
      </li>
    ))}
  </ul>
);
