import type { Metadata } from "next";

import DashboardShell from "@/components/dashboard/DashboardShell";

import AddressHistory from "@/components/dashboard/AddressHistory";

export const metadata: Metadata = {
  title: "Address History",

  description:
    "View and manage your secure address history.",

  robots: {
    index: false,
    follow: false,
  },
};

export default function AddressHistoryPage() {
  return (
    <DashboardShell active="history">
      <AddressHistory />
    </DashboardShell>
  );
}