import type { Metadata } from "next";

import DashboardShell from "@/components/dashboard/DashboardShell";
import ReviewerWorkspace from "@/components/dashboard/ReviewerWorkspace";

export const metadata: Metadata = {
  title: "Reviewer Dashboard",

  description:
    "Secure workspace for assigned address reviews.",

  robots: {
    index: false,
    follow: false,
  },
};

export default function ReviewerPage() {
  return (
    <DashboardShell active="reviewer">
      <ReviewerWorkspace />
    </DashboardShell>
  );
}