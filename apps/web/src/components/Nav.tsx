import { NavLink } from "react-router-dom";
import { copy } from "../copy";

const iconPaths = {
  home: "M3 11 12 3l9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  items: "M21 8 12 3 3 8v8l9 5 9-5zM3 8l9 5 9-5M12 13v8",
  groceries: "M3 4h2l2.4 11h10.2l2-8H6.2M9 19.5a.5.5 0 1 0 0 1 .5.5 0 0 0 0-1M17 19.5a.5.5 0 1 0 0 1 .5.5 0 0 0 0-1",
  schedule: "M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM4 10h16M8 3v4M16 3v4",
  people: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2 20c0-3.3 3-6 7-6s7 2.7 7 6M16 4.3a3.5 3.5 0 0 1 0 6.4M18 14.3c2.3.7 4 2.6 4 5.7",
};

const navItems = [
  { to: "/", label: copy.nav.home, icon: iconPaths.home, end: true },
  { to: "/items", label: copy.nav.items, icon: iconPaths.items },
  { to: "/groceries", label: copy.nav.groceries, icon: iconPaths.groceries },
  { to: "/schedule", label: copy.nav.schedule, icon: iconPaths.schedule },
  { to: "/people", label: copy.nav.people, icon: iconPaths.people },
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

const linkClass = (layout: string) => ({ isActive }: { isActive: boolean }) =>
  `flex flex-col items-center justify-center font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ${layout} ${
    isActive ? "bg-primary text-on-primary" : "hover:bg-hover"
  }`;

// The rail is w-32, which fits "Groceries" at text-base; a longer label needs a wider rail.
const railLink = linkClass("gap-1.5 rounded-2xl py-3 text-base");
const barLink = linkClass("min-h-14 gap-0.5 rounded-xl text-meta");

export const RailNav = ({ header }: { header: React.ReactNode }) => (
  <nav
    aria-label={copy.nav.label}
    className="sticky top-0 hidden h-dvh w-32 shrink-0 flex-col gap-2 border-r border-line p-3 md:flex"
  >
    <div className="flex justify-center pb-6 pt-2">{header}</div>
    {navItems.map((item) => (
      <NavLink key={item.to} to={item.to} end={item.end} className={railLink}>
        <NavIcon path={item.icon} className="size-7" />
        {item.label}
      </NavLink>
    ))}
  </nav>
);

export const BottomNav = () => (
  <nav
    aria-label={copy.nav.label}
    className="fixed inset-x-0 bottom-0 z-10 grid grid-cols-5 gap-1 border-t border-line bg-card px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 md:hidden"
  >
    {navItems.map((item) => (
      <NavLink key={item.to} to={item.to} end={item.end} className={barLink}>
        <NavIcon path={item.icon} className="size-6" />
        {item.label}
      </NavLink>
    ))}
  </nav>
);
