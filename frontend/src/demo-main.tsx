import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import SitePage from "@/features/site/SitePage";
import "./index.css";

// Public portfolio build (vite.demo.config.ts): the homepage and its
// simulated demo only. No patient or caregiver code is bundled, and nothing
// here calls a backend.
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <Routes>
        <Route path="*" element={<SitePage />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
