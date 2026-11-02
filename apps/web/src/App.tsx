import { Route, Routes } from "react-router-dom";
import { ItemsPage } from "./pages/ItemsPage";

export const App = () => (
  <main className="mx-auto max-w-5xl p-4 sm:p-6">
    <Routes>
      <Route path="/" element={<ItemsPage />} />
    </Routes>
  </main>
);
