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