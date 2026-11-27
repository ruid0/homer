import { useId, type ReactNode } from "react";
import { copy } from "../../copy";

type Props = {
  title: string;
  children: ReactNode;
  // How many rows the list left out, counted right after the list.
  more?: number;
  // A short count beside the title ("6 to buy"). The section is still named by its title alone.
  count?: string;
};

export const TvSection = ({ title, children, more = 0, count }: Props) => {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId}>
      <h2 className="flex items-baseline gap-[1rem] pb-[0.5rem] text-page font-semibold">
        <span id={headingId}>{title}</span>
        {count && <span className="text-answer font-normal text-muted">{count}</span>}
      </h2>
      {children}
      {more > 0 && <p className="pt-[0.25rem] text-answer text-muted">{copy.tv.more(more)}</p>}
    </section>
  );
};
