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