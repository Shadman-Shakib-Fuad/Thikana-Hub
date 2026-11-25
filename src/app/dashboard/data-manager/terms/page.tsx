import DataManagerShell from "@/components/data-manager/DataManagerShell";
import LocalityManagement from "@/components/data-manager/LocalityManagement";

export default function TermsPage() {
  return (
    <DataManagerShell>
      <LocalityManagement mode="terms" />
    </DataManagerShell>
  );
}
