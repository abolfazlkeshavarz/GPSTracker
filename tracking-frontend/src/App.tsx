import { type ReactNode } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import DeviceDetails from "./pages/DeviceDetails";
import DeviceHistory from "./pages/DeviceHistory";
import ActivateDevice from "./pages/ActivateDevice";
import AdminPanel from "./pages/AdminPanel";
import Alerts from "./pages/Alerts";
import Account from "./pages/Account";
import { useAuthStore } from "./store/authStore";
import { isTokenExpired } from "./lib/token";

function useIsAuthenticated() {
  const token = useAuthStore((state) => state.token);
  // A present-but-expired token is not an authenticated session.
  return !!token && !isTokenExpired(token);
}

/** Requires a live session; sends everyone else to the login page. */
function RequireAuth({ children }: { children: ReactNode }) {
  return useIsAuthenticated() ? <>{children}</> : <Navigate to="/login" replace />;
}

/** Requires a live session with the admin role. */
function RequireAdmin({ children }: { children: ReactNode }) {
  const isAuthenticated = useIsAuthenticated();
  const user = useAuthStore((state) => state.user);

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // Only a UI affordance — the server re-checks the role on every admin route.
  return user?.role === "admin" ? <>{children}</> : <Navigate to="/dashboard" replace />;
}

/** Login/register are pointless once signed in; bounce to the dashboard. */
function GuestOnly({ children }: { children: ReactNode }) {
  return useIsAuthenticated() ? <Navigate to="/dashboard" replace /> : <>{children}</>;
}

function App() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <GuestOnly>
            <Login />
          </GuestOnly>
        }
      />
      <Route
        path="/register"
        element={
          <GuestOnly>
            <Register />
          </GuestOnly>
        }
      />

      <Route
        path="/dashboard"
        element={
          <RequireAuth>
            <Dashboard />
          </RequireAuth>
        }
      />

      <Route
        path="/device/:serial"
        element={
          <RequireAuth>
            <DeviceDetails />
          </RequireAuth>
        }
      />

      <Route
        path="/device/:serial/history"
        element={
          <RequireAuth>
            <DeviceHistory />
          </RequireAuth>
        }
      />

      <Route
        path="/activate"
        element={
          <RequireAuth>
            <ActivateDevice />
          </RequireAuth>
        }
      />

      <Route
        path="/alerts"
        element={
          <RequireAuth>
            <Alerts />
          </RequireAuth>
        }
      />

      <Route
        path="/account"
        element={
          <RequireAuth>
            <Account />
          </RequireAuth>
        }
      />

      <Route
        path="/admin"
        element={
          <RequireAdmin>
            <AdminPanel />
          </RequireAdmin>
        }
      />

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export default App;
