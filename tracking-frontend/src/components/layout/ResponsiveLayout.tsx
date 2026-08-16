import type { ReactNode } from "react";
import AppLayout from "./AppLayout";

/**
 * Kept as a thin alias so existing pages keep working.
 *
 * The old implementation chose between DashboardLayout and MobileLayout based
 * on window width. Because those are different component types, crossing the
 * 768px breakpoint unmounted and remounted every child — losing page state and
 * destroying anything the page owned. AppLayout handles both breakpoints in
 * one tree, so nothing remounts on resize.
 */
export default function ResponsiveLayout({ children }: { children: ReactNode }) {
  return <AppLayout>{children}</AppLayout>;
}
