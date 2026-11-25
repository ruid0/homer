import { Navigate, Route, Routes } from "react-router-dom";
import { BottomNav, RailNav } from "./components/Nav";
import { Wordmark } from "./components/Wordmark";
import { AssistantPage } from "./pages/AssistantPage";
import { HomePage } from "./pages/HomePage";
import { MaintenancePage } from "./pages/MaintenancePage";
import { PeoplePage } from "./pages/PeoplePage";
import { RoutinePage } from "./pages/RoutinePage";
import { SchedulePage } from "./pages/SchedulePage";
import { StockPage } from "./pages/StockPage";
import { TvPage } from "./pages/TvPage";

const Shell = () => (
  <div className="min-h-dvh md:flex">
    <RailNav header={<Wordmark markOnly />} />
    <div className="min-w-0 flex-1">
      <header className="px-4 pt-3 md:hidden">
        <Wordmark />
      </header>
      {/* pb-28 clears the fixed bottom bar (BottomNav). */}
      <main tabIndex={-1} className="mx-auto max-w-5xl p-4 pb-28 outline-none sm:p-6 md:pb-6">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/stock" element={<StockPage />} />
          {/* The old addresses: a home-screen shortcut or an old note still opens the right view. */}
          <Route path="/items" element={<Navigate to="/stock?view=everything" replace />} />
          <Route path="/groceries" element={<Navigate to="/stock" replace />} />
          <Route path="/schedule" element={<SchedulePage />} />
          <Route path="/upkeep" element={<MaintenancePage />} />
          <Route path="/people" element={<PeoplePage />} />
          <Route path="/people/:id/routine" element={<RoutinePage />} />
          <Route path="/assistant" element={<AssistantPage />} />
        </Routes>
      </main>
    </div>
    <BottomNav />
  </div>
);

// The TV page is a screen of its own: no nav, and nothing to tap.
export const App = () => (
  <Routes>
    <Route path="/tv" element={<TvPage />} />
    <Route path="*" element={<Shell />} />
  </Routes>
);
