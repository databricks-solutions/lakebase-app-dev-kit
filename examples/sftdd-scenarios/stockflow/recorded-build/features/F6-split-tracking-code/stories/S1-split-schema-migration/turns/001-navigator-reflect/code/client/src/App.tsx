import { Routes, Route } from "react-router-dom";
import { HomePage } from "./pages/HomePage";
import { RecordStockPage } from "./pages/RecordStock";

// Route-level composition lives here. Pages compose components and use hooks
// for data; components and hooks never wire routes themselves.
export function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/record" element={<RecordStockPage />} />
    </Routes>
  );
}
