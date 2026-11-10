import { useCallback, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";

// hideTitle keeps the heading for screen readers when the page already says what the card is.
type Props = { title: string; children: ReactNode; className?: string; hideTitle?: boolean };

const SLACK_PX = 4;

// The body scrolls inside the card. A fade over the bottom edge shows while more rows remain below.
export const ScrollCard = ({ title, children, className = "", hideTitle = false }: Props) => {
  const body = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const [hasMore, setHasMore] = useState(false);
  const headingId = useId();

  const measure = useCallback(() => {
    const element = body.current;
    if (element) setHasMore(element.scrollHeight - element.scrollTop - element.clientHeight > SLACK_PX);
  }, []);

  useLayoutEffect(() => {
    const [element, inner] = [body.current, content.current];
    if (!element || !inner) return;
    measure();
    // The inner wrapper is always there, so a loading line being swapped for a list is still seen.
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    observer.observe(inner);
    return () => observer.disconnect();
  }, [measure]);

  return (
    <section aria-labelledby={headingId} className={`relative flex min-h-0 flex-col rounded-2xl border border-line bg-card ${className}`}>
      <h2 id={headingId} className={hideTitle ? "sr-only" : "px-5 pb-2 pt-4 text-section font-semibold"}>{title}</h2>
      <div ref={body} onScroll={measure} className={`min-h-0 flex-1 overflow-y-auto px-5 pb-4 ${hideTitle ? "pt-4" : ""}`}>
        <div ref={content}>{children}</div>
      </div>
      {hasMore && (
        <div
          aria-hidden="true"
          data-testid="scroll-fade"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-8 rounded-b-2xl bg-linear-to-t from-card to-transparent"
        />
      )}
    </section>
  );
};
