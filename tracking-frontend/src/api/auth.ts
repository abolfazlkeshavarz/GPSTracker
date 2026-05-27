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