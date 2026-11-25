import DataManagerShell from "@/components/data-manager/DataManagerShell";
import DataManagerOverview from "@/components/data-manager/DataManagerOverview";

export default function DataManagerPage() {
  return (
    <DataManagerShell>
      <DataManagerOverview />
    </DataManagerShell>
  );
}
