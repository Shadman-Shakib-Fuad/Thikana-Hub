import DataManagerEntry from "@/components/data-manager/DataManagerEntry";
import type { Metadata } from "next";

import Dashboard from "@/components/dashboard/Dashboard";

export const metadata: Metadata = {
  title: "Dashboard",

  description:
    "Your personal ThikanaHub workspace.",

  robots: {
    index: false,
    follow: false,
  },
};

export default function DashboardPage() {
  return <DataManagerEntry>
      <Dashboard />
    </DataManagerEntry>;
}