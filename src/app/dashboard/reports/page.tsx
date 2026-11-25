import type { Metadata } from "next";

import DashboardShell from "@/components/dashboard/DashboardShell";

import MerchantReports from "@/components/dashboard/MerchantReports";

export const metadata: Metadata = {
  title: "Analytics Reports",

  description:
    "Generate and download merchant analytics reports.",

  robots: {
    index: false,
    follow: false,
  },
};

export default function ReportsPage() {
  return (
    <DashboardShell active="reports">

      <MerchantReports />

    </DashboardShell>
  );
}