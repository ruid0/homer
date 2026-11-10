import { NavLink } from "react-router-dom";
import { copy } from "../copy";
import { needsDoing } from "../lib/maintenanceText";
import { useToday } from "../lib/useToday";
import { trpc } from "../trpc";

const iconPaths = {
  home: "M3 11 12 3l9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  items: "M21 8 12 3 3 8v8l9 5 9-5zM3 8l9 5 9-5M12 13v8",
  groceries: "M3 4h2l2.4 11h10.2l2-8H6.2M9 19.5a.5.5 0 1 0 0 1 .5.5 0 0 0 0-1M17 19.5a.5.5 0 1 0 0 1 .5.5 0 0 0 0-1",
  schedule: "M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM4 10h16M8 3v4M16 3v4",
  assistant: "M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12zM8.5 11.5h.01M12 11.5h.01M15.5 11.5h.01",
  upkeep: "M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z",
  people: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2 20c0-3.3 3-6 7-6s7 2.7 7 6M16 4.3a3.5 3.5 0 0 1 0 6.4M18 14.3c2.3.7 4 2.6 4 5.7",
};

const navItems: { to: string; label: string; icon: string; end?: boolean; badge?: boolean }[] = [
  { to: "/", label: copy.nav.home, icon: iconPaths.home, end: true },
  { to: "/groceries", label: copy.nav.groceries, icon: iconPaths.groceries },
  { to: "/schedule", label: copy.nav.schedule, icon: iconPaths.schedule },
  { to: "/upkeep", label: copy.nav.upkeep, icon: iconPaths.upkeep, badge: true },
  { to: "/items", label: copy.nav.items, icon: iconPaths.items },
  { to: "/people", label: copy.nav.people, icon: iconPaths.people },
  { to: "/assistant", label: copy.nav.assistant, icon: iconPaths.assistant },
];

const NavIcon = ({ path, className }: { path: string; className: string }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    className={className}
  >
    <path d={path} />
  </svg>
);

const REFRESH_MS = 60_000;
const MOST_SHOWN = 9;

// How many upkeep jobs need doing: a number on the nav, and words after the label for a screen reader.
// Red only when something is overdue or due today; jobs due this week are told in the amber of the rows.
const useDue = (): { count: number; late: boolean } => {
  const today = useToday();
  const list = trpc.maintenance.list.useQuery({ today }, { refetchInterval: REFRESH_MS });
  const due = (list.data ?? []).filter((item) => needsDoing(item.status));
  return { count: due.length, late: due.some((item) => item.status === "overdue" || item.status === "due") };
};

type Item = (typeof navItems)[number];

const NavContent = ({ item, size }: { item: Item; size: string }) => {
  const due = useDue();
  const count = item.badge ? due.count : 0;
  return (
    <>
      <span className="relative">
        <NavIcon path={item.icon} className={size} />
        {count > 0 && (
          <span
            aria-hidden="true"
            data-level={due.late ? "late" : "soon"}
            className={`absolute -right-3 -top-1 min-w-5 rounded-full px-1 text-center text-nav font-bold leading-5 text-card ${due.late ? "bg-late" : "bg-warn"}`}
          >
            {count > MOST_SHOWN ? `${MOST_SHOWN}+` : count}
          </span>
        )}
      </span>
      {item.label}
      {count > 0 && <span className="sr-only">{copy.nav.dueCount(count)}</span>}
    </>
  );
};

const linkClass = (layout: string) => ({ isActive }: { isActive: boolean }) =>
  `flex flex-col items-center justify-center font-bold transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ${layout} ${
    isActive ? "bg-primary text-on-primary" : "hover:bg-hover"
  }`;

// The rail is w-32, which fits "Groceries" at text-base; a longer label needs a wider rail.
const railLink = linkClass("gap-1 rounded-2xl py-2 text-base");
// Seven labels share the width of a phone, so the bar uses a small size and a tight track. the nav token keeps "Groceries" inside its cell at 360px.
const barLink = linkClass("min-h-14 min-w-0 gap-0.5 rounded-xl text-nav tracking-tight");

export const RailNav = ({ header }: { header: React.ReactNode }) => (
  <nav
    aria-label={copy.nav.label}
    className="sticky top-0 hidden h-dvh w-32 shrink-0 flex-col gap-1 overflow-y-auto border-r border-line p-3 md:flex"
  >
    <div className="flex justify-center pb-3 pt-2">{header}</div>
    {navItems.map((item) => (
      <NavLink key={item.to} to={item.to} end={item.end} className={railLink}>
        <NavContent item={item} size="size-6" />
      </NavLink>
    ))}
  </nav>
);

export const BottomNav = () => (
  <nav
    aria-label={copy.nav.label}
    className="fixed inset-x-0 bottom-0 z-10 grid grid-cols-7 gap-0.5 border-t border-line bg-card px-1 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 md:hidden"
  >
    {navItems.map((item) => (
      <NavLink key={item.to} to={item.to} end={item.end} className={barLink}>
        <NavContent item={item} size="size-6" />
      </NavLink>
    ))}
  </nav>
);
