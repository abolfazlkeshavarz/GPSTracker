import {
  Routes,
  Route,
  Navigate,
} from "react-router-dom";

import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import DeviceDetails from "./pages/DeviceDetails";
import ActivateDevice from "./pages/ActivateDevice";

function App() {

  const token =
    localStorage.getItem(
      "token"
    );

  return (
    <Routes>


      <Route
        path="/activate"
        element={<ActivateDevice />}
      />


      <Route
        path="/login"
        element={<Login />}
      />

      <Route
        path="/register"
        element={<Register />}
      />

      <Route
        path="/dashboard"
        element={
          token
            ? <Dashboard />
            : <Navigate to="/login" />
        }
      />

      <Route
        path="/device/:serial"
        element={
          token
            ? <DeviceDetails />
            : <Navigate to="/login" />
        }
      />

      <Route
        path="*"
        element={
          <Navigate
            to="/dashboard"
          />
        }
      />

    </Routes>
  );
}

export default App;