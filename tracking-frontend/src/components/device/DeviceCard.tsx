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