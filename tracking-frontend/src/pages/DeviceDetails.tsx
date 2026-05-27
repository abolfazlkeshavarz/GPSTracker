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