import type { Metadata } from "next";

import DashboardShell from "@/components/dashboard/DashboardShell";

import MerchantAnalytics from "@/components/dashboard/MerchantAnalytics";

export const metadata: Metadata = {
  title: "Merchant Analytics",

  description:
    "Monitor your secure address resolution activity.",

  robots: {
    index: false,
    follow: false,
  },
};

export default function AnalyticsPage() {
  return (
    <DashboardShell active="analytics">

      <MerchantAnalytics />

    </DashboardShell>
  );
}