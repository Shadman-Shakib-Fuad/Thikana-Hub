import DataManagerShell from "@/components/data-manager/DataManagerShell";
import ProposalManagement from "@/components/data-manager/ProposalManagement";

export default function DecisionHistoryPage() {
  return (
    <DataManagerShell>
      <ProposalManagement history />
    </DataManagerShell>
  );
}
