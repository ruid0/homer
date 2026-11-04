import type { ReactNode } from "react";

// One card of rows. The first row sits flush under the card's top edge, so it drops its divider.
export const ListCard = ({ children }: { children: ReactNode }) => (
  <section className="rounded-2xl border border-line bg-card px-5 pb-2">
    <ul className="[&>li:first-child]:border-t-0">{children}</ul>
  </section>
);
