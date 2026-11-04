import { NavLink, Route, Routes } from "react-router-dom";
import { Wordmark } from "./components/Wordmark";
import { GroceriesPage } from "./pages/GroceriesPage";
import { ItemsPage } from "./pages/ItemsPage";
import { PeoplePage } from "./pages/PeoplePage";
import { SchedulePage } from "./pages/SchedulePage";
import { copy } from "./copy";

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `inline-flex min-h-11 items-center rounded-lg px-4 text-base font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ${
    isActive ? "bg-ink text-on-ink" : "hover:bg-hover"
  }`;

export const App = () => (
  <main className="mx-auto max-w-5xl p-4 sm:p-6">
    <header className="mb-2">
      <Wordmark />
    </header>
    <nav aria-label={copy.nav.label} className="mb-4 flex flex-wrap gap-2">
      <NavLink to="/" end className={linkClass}>{copy.nav.items}</NavLink>
      <NavLink to="/groceries" className={linkClass}>{copy.nav.groceries}</NavLink>
      <NavLink to="/schedule" className={linkClass}>{copy.nav.schedule}</NavLink>
      <NavLink to="/people" className={linkClass}>{copy.nav.people}</NavLink>
    </nav>
    <Routes>
      <Route path="/" element={<ItemsPage />} />
      <Route path="/groceries" element={<GroceriesPage />} />
      <Route path="/schedule" element={<SchedulePage />} />
      <Route path="/people" element={<PeoplePage />} />
    </Routes>
  </main>
);
