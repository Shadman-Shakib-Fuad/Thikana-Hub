import DataManagerShell from "@/components/data-manager/DataManagerShell";
import LocalityManagement from "@/components/data-manager/LocalityManagement";

export default function LocalitiesPage() {
  return (
    <DataManagerShell>
      <LocalityManagement mode="localities" />
    </DataManagerShell>
  );
}
