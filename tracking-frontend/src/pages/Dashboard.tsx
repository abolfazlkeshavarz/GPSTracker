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