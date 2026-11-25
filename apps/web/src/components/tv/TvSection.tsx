import { useId, type ReactNode } from "react";
import { copy } from "../../copy";

type Props = {
  title: string;
  children: ReactNode;
  // How many rows the list left out, counted right after the list.
  more?: number;
  // A closing line under the list and its "more".
  note?: ReactNode;
};

export const TvSection = ({ title, children, more = 0, note }: Props) => {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId}>
      <h2 id={headingId} className="pb-[0.5rem] text-page font-semibold">
        {title}
      </h2>
      {children}
      {more > 0 && <p className="pt-[0.25rem] text-answer text-muted">{copy.tv.more(more)}</p>}
      {note}
    </section>
  );
};
