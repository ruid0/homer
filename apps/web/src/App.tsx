import { Route, Routes } from "react-router-dom";
import { BottomNav, RailNav } from "./components/Nav";
import { Wordmark } from "./components/Wordmark";
import { AssistantPage } from "./pages/AssistantPage";
import { GroceriesPage } from "./pages/GroceriesPage";
import { HomePage } from "./pages/HomePage";
import { ItemsPage } from "./pages/ItemsPage";
import { PeoplePage } from "./pages/PeoplePage";
import { SchedulePage } from "./pages/SchedulePage";

export const App = () => (
  <div className="min-h-dvh md:flex">
    <RailNav header={<Wordmark markOnly />} />
    <div className="min-w-0 flex-1">
      <header className="px-4 pt-3 md:hidden">
        <Wordmark />
      </header>
      {/* pb-28 clears the fixed bottom bar (BottomNav). */}
      <main className="mx-auto max-w-5xl p-4 pb-28 sm:p-6 md:pb-6">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/items" element={<ItemsPage />} />
          <Route path="/groceries" element={<GroceriesPage />} />
          <Route path="/schedule" element={<SchedulePage />} />
          <Route path="/people" element={<PeoplePage />} />
          <Route path="/assistant" element={<AssistantPage />} />
        </Routes>
      </main>
    </div>
    <BottomNav />
  </div>
);
