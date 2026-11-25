import type { Metadata } from "next";

import DashboardShell from "@/components/dashboard/DashboardShell";

import AddressHistory from "@/components/dashboard/AddressHistory";

export const metadata: Metadata = {
  title: "Saved Addresses",

  description:
    "Manage your securely saved addresses.",

  robots: {
    index: false,
    follow: false,
  },
};

export default function SavedAddressesPage() {
  return (
    <DashboardShell active="saved">
      <AddressHistory savedOnly />
    </DashboardShell>
  );
}