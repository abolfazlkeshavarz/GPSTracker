import { ReactNode, useEffect, useState } from "react";
import MobileLayout from "./MobileLayout";
import DashboardLayout from "./DashboardLayout";

interface Props {
  children: ReactNode;
}

export default function ResponsiveLayout({ children }: Props) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();

    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  if (isMobile) {
    return <MobileLayout>{children}</MobileLayout>;
  }

  return <DashboardLayout>{children}</DashboardLayout>;
}