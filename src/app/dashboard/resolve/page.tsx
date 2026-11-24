import type { Metadata } from "next";

import DashboardShell from "@/components/dashboard/DashboardShell";

import AddressResolver from "@/components/dashboard/AddressResolver";

export const metadata: Metadata = {
  title: "Address Resolver",

  description:
    "Resolve multilingual Bangladesh addresses securely with ThikanaHub.",

  robots: {
    index: false,
    follow: false,
  },
};

export default function ResolveAddressPage() {
  return (
    <DashboardShell active="resolve">
      <AddressResolver />
    </DashboardShell>
  );
}