import type { Metadata } from "next";

import DashboardShell from "@/components/dashboard/DashboardShell";

import MerchantReviewWorkspace from "@/components/dashboard/MerchantReviewWorkspace";

export const metadata: Metadata = {
  title: "Manual Reviews",

  description:
    "Track and manage manual address review recommendations.",

  robots: {
    index: false,
    follow: false,
  },
};

export default function MerchantReviewsPage() {
  return (
    <DashboardShell active="reviews">
      <MerchantReviewWorkspace />
    </DashboardShell>
  );
}