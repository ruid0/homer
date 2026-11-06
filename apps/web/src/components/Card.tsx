import { useId, type ReactNode } from "react";

type Props = { title: ReactNode; children: ReactNode; className?: string };

// A Home card that is as tall as its rows. The page scrolls, so there is no scroll area inside a scroll area.
export const Card = ({ title, children, className = "" }: Props) => {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className={`rounded-2xl border border-line bg-card px-5 pb-4 ${className}`}>
      <h2 id={headingId} className="pb-2 pt-4 text-section font-semibold">{title}</h2>
      {children}
    </section>
  );
};
