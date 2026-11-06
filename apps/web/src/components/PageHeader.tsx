import type { ReactNode } from "react";

type Props = { title: string; action?: ReactNode; blurb?: string };

// The top of every list page: the title, the page's main action to its right, and an optional one-line note under it.
export const PageHeader = ({ title, action, blurb }: Props) => (
  <header className="mb-4">
    <div className="flex min-h-11 flex-wrap items-center justify-between gap-3">
      <h1 className="text-page font-semibold">{title}</h1>
      {action}
    </div>
    {blurb && <p className="mt-1 text-muted">{blurb}</p>}
  </header>
);
