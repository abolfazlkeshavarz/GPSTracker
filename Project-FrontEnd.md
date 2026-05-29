# PHASE 1 — COMPLETE GPS TRACKER FRONTEND (ZERO → HERO)

You already created the Vite project correctly.

Now we will build a REAL frontend architecture professionally.

This phase includes:

* React
* TypeScript
* Tailwind
* Login/Register
* JWT auth
* Protected routes
* Dashboard
* Device cards
* Live WebSocket
* OpenStreetMap
* Device details page
* Real-time tracking

You should COPY EXACTLY.

---

# STEP 1 — INSTALL ALL DEPENDENCIES

Run:

```bash id="r0c8yj"
npm install axios react-router-dom zustand maplibre-gl react-map-gl lucide-react
```

---

# STEP 2 — CREATE FULL FOLDER STRUCTURE

Inside `src/` create:

```md id="c7cz1h"
GPSTracker
│──tracking-backend/
│  
│──tracking-frontend/
│  │  src/
│  │  ├── api/
│  │  ├── components/
│  │  │   ├── device/
│  │  │   ├── layout/
│  │  │   ├── map/
│  │  │   └── ui/
│  │  ├── hooks/
│  │  ├── pages/
│  │  ├── routes/
│  │  ├── store/
│  │  ├── types/
│  │  ├── utils/

```

---

# STEP 3 — DELETE DEFAULT FILES

Delete:

```md id="pqu9fr"
src/App.css
src/assets
```

---

# STEP 4 — CONFIGURE TAILWIND

# `src/index.css`

REPLACE EVERYTHING:

```css id="cujlca"
@tailwind base;
@tailwind components;
@tailwind utilities;

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  padding: 0;
  font-family: sans-serif;
  background: #f3f4f6;
}
```

---

# STEP 5 — CREATE TYPES

# `src/types/index.ts`

```ts id="mu5m4o"
export interface User {
  id: number;
  phone: string;
}

export interface Device {
  serial: string;
  user_id: number;
  activated_at: string;
}

export interface LocationData {
  device: string;
  lat: number;
  lng: number;
  speed: number;
  sat: number;
  csq: number;
  battery: number;
  operator: string;
  ignition: boolean;
  timestamp: number;
}

export interface SignalData {
  device_serial: string;
  gps_bars: number;
  gprs_bars: number;
  satellites: number;
  csq: number;
}
```

---

# STEP 6 — AXIOS CONFIG

# `src/api/axios.ts`

```ts id="wxofz2"
import axios from "axios";

const api = axios.create({
  baseURL: "http://localhost:8080/api",
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");

  if (token) {
    config.headers.Authorization =
      `Bearer ${token}`;
  }

  return config;
});

export default api;
```

---

# STEP 7 — AUTH API

# `src/api/auth.ts`

```ts id="23l9kq"
import api from "./axios";

export const loginUser = async (
  phone: string,
  password: string
) => {
  const response = await api.post(
    "/login",
    {
      phone,
      password,
    }
  );

  return response.data;
};

export const registerUser = async (
  phone: string,
  password: string
) => {
  const response = await api.post(
    "/register",
    {
      phone,
      password,
    }
  );

  return response.data;
};
```

---

# STEP 8 — DEVICE API

# `src/api/devices.ts`

```ts id="1sl4p8"
import api from "./axios";

export const getDevices = async () => {
  const response =
    await api.get("/devices");

  return response.data;
};

export const getLatestLocation =
  async (serial: string) => {
    const response =
      await api.get(
        `/devices/${serial}/latest`
      );

    return response.data;
  };

export const getDeviceStatus =
  async (serial: string) => {
    const response =
      await api.get(
        `/devices/${serial}/status`
      );

    return response.data;
  };

export const getSignal =
  async (serial: string) => {
    const response =
      await api.get(
        `/devices/${serial}/signal`
      );

    return response.data;
  };

export const getHistory =
  async (serial: string) => {
    const response =
      await api.get(
        `/devices/${serial}/history`
      );

    return response.data;
  };

export const activateDevice =
  async (serial: string) => {
    const response =
      await api.post(
        "/activate",
        {
          serial,
        }
      );

    return response.data;
  };
```

---

# STEP 9 — AUTH STORE

# `src/store/authStore.ts`

```ts id="uytq5o"
import { create } from "zustand";

interface AuthState {
  token: string | null;
  user: any;

  login: (
    token: string,
    user: any
  ) => void;

  logout: () => void;
}

export const useAuthStore =
  create<AuthState>((set) => ({
    token:
      localStorage.getItem("token"),

    user: null,

    login: (token, user) => {
      localStorage.setItem(
        "token",
        token
      );

      set({
        token,
        user,
      });
    },

    logout: () => {
      localStorage.removeItem(
        "token"
      );

      set({
        token: null,
        user: null,
      });
    },
  }));
```

---

# STEP 10 — WEBSOCKET HOOK

# `src/hooks/useWebSocket.ts`

```ts id="7xq9ms"
import {
  useEffect,
} from "react";

interface Props {
  onMessage: (
    data: any
  ) => void;
}

export const useWebSocket = ({
  onMessage,
}: Props) => {
  useEffect(() => {
    const token =
      localStorage.getItem(
        "token"
      );

    const ws =
      new WebSocket(
        `ws://localhost:8080/api/ws?token=${token}`
      );

    ws.onopen = () => {
      console.log(
        "WebSocket connected"
      );
    };

    ws.onmessage = (
      event
    ) => {
      const data =
        JSON.parse(
          event.data
        );

      onMessage(data);
    };

    ws.onerror = (
      error
    ) => {
      console.error(error);
    };

    ws.onclose = () => {
      console.log(
        "WebSocket closed"
      );
    };

    return () => {
      ws.close();
    };
  }, []);
};
```

---

# IMPORTANT BACKEND FIX

YOUR CURRENT BACKEND DOES NOT SUPPORT WEBSOCKET TOKEN QUERY.

YOU MUST MODIFY BACKEND.

---

# MODIFY:

## `internal/api/websocket.go`

ADD THESE IMPORTS:

```go id="o4tlpq"
"tracking-backend/internal/config"
"tracking-backend/internal/utils"
```

---

# NOW MODIFY `HandleWebSocket`

REPLACE FIRST LINES WITH:

```go id="n4c8wb"
func HandleWebSocket(c *gin.Context) {

    token := c.Query("token")

    if token == "" {
        c.JSON(http.StatusUnauthorized, gin.H{
            "error": "missing token",
        })
        return
    }

    claims, err := utils.ValidateJWT(
        token,
        config.AppConfig.JWTSecret,
    )

    if err != nil {
        c.JSON(http.StatusUnauthorized, gin.H{
            "error": "invalid token",
        })
        return
    }

    userID := claims.UserID
```

---

# STEP 11 — LOGIN PAGE

# `src/pages/Login.tsx`

```tsx id="gdm2an"
import {
  useState,
} from "react";

import {
  loginUser,
} from "../api/auth";

import {
  useNavigate,
  Link,
} from "react-router-dom";

import {
  useAuthStore,
} from "../store/authStore";

export default function Login() {
  const navigate =
    useNavigate();

  const auth =
    useAuthStore();

  const [phone, setPhone] =
    useState("");

  const [
    password,
    setPassword,
  ] = useState("");

  const [loading, setLoading] =
    useState(false);

  const handleLogin =
    async () => {
      try {
        setLoading(true);

        const data =
          await loginUser(
            phone,
            password
          );

        auth.login(
          data.token,
          data.user
        );

        navigate(
          "/dashboard"
        );
      } catch (err: any) {
        alert(
          err.response?.data
            ?.error ||
            "Login failed"
        );
      } finally {
        setLoading(false);
      }
    };

  return (
    <div className="h-screen flex items-center justify-center bg-gray-100">
      <div className="bg-white w-[400px] p-8 rounded-2xl shadow-xl">
        <h1 className="text-3xl font-bold mb-6">
          GPS Tracker
        </h1>

        <input
          type="text"
          placeholder="Phone"
          className="w-full border p-3 rounded-xl mb-4"
          value={phone}
          onChange={(e) =>
            setPhone(
              e.target.value
            )
          }
        />

        <input
          type="password"
          placeholder="Password"
          className="w-full border p-3 rounded-xl mb-4"
          value={password}
          onChange={(e) =>
            setPassword(
              e.target.value
            )
          }
        />

        <button
          onClick={
            handleLogin
          }
          disabled={loading}
          className="w-full bg-black text-white p-3 rounded-xl"
        >
          {loading
            ? "Loading..."
            : "Login"}
        </button>

        <div className="mt-4">
          <Link
            to="/register"
            className="text-blue-500"
          >
            Create account
          </Link>
        </div>
      </div>
    </div>
  );
}
```

---

# STEP 12 — REGISTER PAGE

# `src/pages/Register.tsx`

```tsx id="k2n5x8"
import {
  useState,
} from "react";

import {
  registerUser,
} from "../api/auth";

import {
  useNavigate,
} from "react-router-dom";

export default function Register() {
  const navigate =
    useNavigate();

  const [phone, setPhone] =
    useState("");

  const [
    password,
    setPassword,
  ] = useState("");

  const handleRegister =
    async () => {
      try {
        await registerUser(
          phone,
          password
        );

        alert(
          "Registered successfully"
        );

        navigate(
          "/login"
        );
      } catch (err: any) {
        alert(
          err.response?.data
            ?.error ||
            "Register failed"
        );
      }
    };

  return (
    <div className="h-screen flex items-center justify-center bg-gray-100">
      <div className="bg-white w-[400px] p-8 rounded-2xl shadow-xl">
        <h1 className="text-3xl font-bold mb-6">
          Register
        </h1>

        <input
          type="text"
          placeholder="Phone"
          className="w-full border p-3 rounded-xl mb-4"
          value={phone}
          onChange={(e) =>
            setPhone(
              e.target.value
            )
          }
        />

        <input
          type="password"
          placeholder="Password"
          className="w-full border p-3 rounded-xl mb-4"
          value={password}
          onChange={(e) =>
            setPassword(
              e.target.value
            )
          }
        />

        <button
          onClick={
            handleRegister
          }
          className="w-full bg-black text-white p-3 rounded-xl"
        >
          Register
        </button>
      </div>
    </div>
  );
}
```

---

# STEP 13 — DEVICE CARD COMPONENT

# `src/components/device/DeviceCard.tsx`

```tsx id="wwu6t8"
import {
  Link,
} from "react-router-dom";

interface Props {
  serial: string;
}

export default function DeviceCard({
  serial,
}: Props) {
  return (
    <Link
      to={`/device/${serial}`}
    >
      <div className="bg-white rounded-2xl shadow p-5 hover:shadow-xl transition">
        <h2 className="text-2xl font-bold">
          {serial}
        </h2>

        <p className="text-gray-500 mt-2">
          GPS Tracker Device
        </p>
      </div>
    </Link>
  );
}
```

---

# STEP 14 — DASHBOARD PAGE

# `src/pages/Dashboard.tsx`

```tsx id="8ddrtx"
import {
  useEffect,
  useState,
} from "react";

import {
  getDevices,
} from "../api/devices";

import DeviceCard from "../components/device/DeviceCard";

export default function Dashboard() {

  const [devices, setDevices] =
    useState<any[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  useEffect(() => {
    loadDevices();
  }, []);

  const loadDevices =
    async () => {

      try {

        const data =
          await getDevices();

        console.log(data);

        if (
          data &&
          Array.isArray(
            data.devices
          )
        ) {
          setDevices(
            data.devices
          );
        } else {
          setDevices([]);
        }

      } catch (err: any) {

        console.error(err);

        setError(
          err.response?.data
            ?.error ||
            "Failed to load devices"
        );

      } finally {

        setLoading(false);

      }
    };

  if (loading) {
    return (
      <div className="p-10">
        Loading...
      </div>
    );
  }

  return (
    <div className="p-8">

      <div className="flex items-center justify-between mb-8">

        <h1 className="text-4xl font-bold">
          Dashboard
        </h1>

      </div>

      {error && (
        <div className="bg-red-100 text-red-700 p-4 rounded-xl mb-5">
          {error}
        </div>
      )}

      {devices.length === 0 ? (
        <div className="bg-white p-8 rounded-2xl shadow">

          <h2 className="text-2xl font-semibold mb-3">
            No Devices Yet
          </h2>

          <p className="text-gray-500">
            Activate your first GPS tracker device.
          </p>

        </div>
      ) : (

        <div className="grid grid-cols-3 gap-5">

          {devices.map(
            (device) => (
              <DeviceCard
                key={
                  device.serial
                }
                serial={
                  device.serial
                }
              />
            )
          )}

        </div>

      )}

    </div>
  );
}
```

---

# STEP 15 — LIVE MAP

# `src/components/map/LiveMap.tsx`

```tsx id="q4q3cw"
import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";

import "maplibre-gl/dist/maplibre-gl.css";

interface Props {
  lat: number;
  lng: number;
}

export default function LiveMap({ lat, lng }: Props) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);

  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainer.current,

      style:
        "http://localhost:8081/styles/osm-bright/style.json",

      center: [lng, lat],
      zoom: 15,

      attributionControl: false,
    });

    map.addControl(new maplibregl.NavigationControl());

    map.on("load", () => {
      console.log("MAP LOADED");

      markerRef.current = new maplibregl.Marker({
        color: "red",
      })
        .setLngLat([lng, lat])
        .addTo(map);

      map.resize();
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current) return;

    markerRef.current?.setLngLat([lng, lat]);

    mapRef.current.easeTo({
      center: [lng, lat],
      duration: 1000,
    });
  }, [lat, lng]);

  return (
    <div
      ref={mapContainer}
      style={{
        width: "100%",
        height: "100vh",
      }}
    />
  );
}
```

---

# STEP 16 — DEVICE DETAILS PAGE

# `src/pages/DeviceDetails.tsx`

```tsx id="7rm9ep"
import {
  useParams,
} from "react-router-dom";

import {
  useEffect,
  useState,
} from "react";

import {
  getLatestLocation,
} from "../api/devices";

import LiveMap from "../components/map/LiveMap";

import {
  useWebSocket,
} from "../hooks/useWebSocket";

export default function DeviceDetails() {

  const { serial } =
    useParams();

  const [
    location,
    setLocation,
  ] = useState<any>(
    null
  );

  useEffect(() => {
    loadLocation();
  }, []);

  const loadLocation =
    async () => {
      if (!serial) return;

      try {
        const data =
          await getLatestLocation(
            serial
          );

        setLocation(data);
      } catch (err) {
        console.error(err);
      }
    };

  useWebSocket({
    onMessage: (
      data
    ) => {
      if (
        data.device ===
        serial
      ) {
        setLocation(data);
      }
    },
  });

  if (!location) {
    return (
      <div className="p-10">
        Loading...
      </div>
    );
  }

  return (
    <div className="p-8">

      <h1 className="text-4xl font-bold mb-8">
        {serial}
      </h1>

      <div className="grid grid-cols-4 gap-4 mb-6">

        <div className="bg-white p-5 rounded-2xl shadow">
          <h2 className="text-gray-500">
            Speed
          </h2>

          <p className="text-3xl font-bold">
            {location.speed}
            km/h
          </p>
        </div>

        <div className="bg-white p-5 rounded-2xl shadow">
          <h2 className="text-gray-500">
            Satellites
          </h2>

          <p className="text-3xl font-bold">
            {location.sat}
          </p>
        </div>

        <div className="bg-white p-5 rounded-2xl shadow">
          <h2 className="text-gray-500">
            Signal
          </h2>

          <p className="text-3xl font-bold">
            {location.csq}
          </p>
        </div>

        <div className="bg-white p-5 rounded-2xl shadow">
          <h2 className="text-gray-500">
            Battery
          </h2>

          <p className="text-3xl font-bold">
            {location.battery}
            V
          </p>
        </div>
      </div>

      <LiveMap
        lat={location.lat}
        lng={location.lng}
        serial={serial || ""}
      />
    </div>
  );
}
```

---

# STEP 17 — DEVICE ACTIVATING PAGE

# `src/pages/ActivateDevice.tsx`

```tsx id="7rm9ep"
import { useState } from "react";

import axios from "axios";

export default function ActivateDevice() {

  const [serial, setSerial] =
    useState("");

  const [message, setMessage] =
    useState("");

  const activateDevice =
    async () => {

      try {

        const token =
          localStorage.getItem(
            "token"
          );

        const response =
          await axios.post(
            "http://localhost:8080/api/activate",
            {
              serial,
            },
            {
              headers: {
                Authorization:
                  `Bearer ${token}`,
              },
            }
          );

        setMessage(
          response.data.message
        );

      } catch (err: any) {

        setMessage(
          err.response?.data
            ?.error ||
            "Activation failed"
        );

      }
    };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">

      <div className="bg-white p-8 rounded-2xl shadow w-[400px]">

        <h1 className="text-3xl font-bold mb-6">
          Activate Device
        </h1>

        <input
          type="text"
          placeholder="Device Serial"
          value={serial}
          onChange={(e) =>
            setSerial(
              e.target.value
            )
          }
          className="w-full border p-3 rounded-xl mb-4"
        />

        <button
          onClick={activateDevice}
          className="w-full bg-black text-white p-3 rounded-xl"
        >
          Activate
        </button>

        {message && (
          <p className="mt-4">
            {message}
          </p>
        )}

      </div>

    </div>
  );
}
```
---


# STEP 18 — APP ROUTES

# `src/App.tsx`

```tsx id="djlwm5"
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
```

---

# STEP 19 — MAIN.TSX

# `src/main.tsx`

```tsx id="5sp3mx"
import React from "react";

import ReactDOM from "react-dom/client";

import {
  BrowserRouter,
} from "react-router-dom";

import App from "./App";
import "./index.css";

ReactDOM.createRoot(
  document.getElementById("root")!
).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
```

---


BACKEND:

```bash id="r0c0te"
go run cmd/server/main.go
```

FRONTEND:

```bash id="4kmbso"
npm run dev
```


Docker for map tiles:
```bash
docker run -it --rm -v C:/maps:/data -p 8081:8080 maptiler/tileserver-gl --file /data/iran-output.mbtiles
docker run -it --rm -v C:/maps:/data -p 8081:80 klokantech/tileserver-gl -c /data/config.json

```

Sample Message:
```bash
 mosquitto_pub -h 85.9.123.30 -u testquitto -P admin -t "devices/TEST003/location" -m "{\"device\":\"TEST003\",\"lat\":36.291419,\"lng\"
:50.005343,\"speed\":45,\"sat\":12,\"csq\":20,\"battery\":12.5,\"operator\":\"Irancell\",\"ignition\":true,\"timestamp\":1700000000}"
```
---