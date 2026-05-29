import { Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import DeviceDetails from "./pages/DeviceDetails";
import ActivateDevice from "./pages/ActivateDevice";
import AdminPanel from "./pages/AdminPanel";
import { useAuthStore } from "./store/authStore";

function App() {
  const { token, user } = useAuthStore();
  const isAuthenticated = !!token;
  const isAdmin = user?.role === "admin";

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      
      <Route
        path="/dashboard"
        element={isAuthenticated ? <Dashboard /> : <Navigate to="/login" />}
      />
      
      <Route
        path="/device/:serial"
        element={isAuthenticated ? <DeviceDetails /> : <Navigate to="/login" />}
      />
      
      <Route
        path="/activate"
        element={isAuthenticated ? <ActivateDevice /> : <Navigate to="/login" />}
      />
      
      <Route
        path="/admin"
        element={isAuthenticated && isAdmin ? <AdminPanel /> : <Navigate to="/dashboard" />}
      />
      
      <Route path="*" element={<Navigate to="/dashboard" />} />
    </Routes>
  );
}

export default App;