// src/main.tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import App from "./App";
import { LanguageProvider } from "./context/LanguageContext";
import { ThemeProvider } from "./context/ThemeContext";
import { RealtimeProvider } from "./context/RealtimeContext";
import PWAHost from "./components/pwa/PWAHost";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider>
      <BrowserRouter>
        <LanguageProvider>
          {/*
            Above the router on purpose: the live socket must survive route
            changes and layout swaps. Owned by a page component, it was being
            torn down and reconnected by ordinary navigation.
          */}
          <RealtimeProvider>
            <App />
            {/* Service worker registration and the update prompt. Above the
                router because registration is per page load, not per route. */}
            <PWAHost />
            <Toaster
              position="top-center"
              toastOptions={{
                duration: 4000,
                // Themed through the same tokens as everything else, so
                // toasts do not flash white in dark mode.
                style: {
                  background: "rgb(var(--surface-raised))",
                  color: "rgb(var(--text-primary))",
                  border: "1px solid rgb(var(--border))",
                  boxShadow: "var(--shadow-lg)",
                  borderRadius: "10px",
                  fontSize: "0.875rem",
                },
                success: { iconTheme: { primary: "rgb(var(--status-good))", secondary: "#fff" } },
                error: { iconTheme: { primary: "rgb(var(--status-critical))", secondary: "#fff" } },
              }}
            />
          </RealtimeProvider>
        </LanguageProvider>
      </BrowserRouter>
    </ThemeProvider>
  </React.StrictMode>
);
