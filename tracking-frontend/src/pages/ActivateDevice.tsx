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