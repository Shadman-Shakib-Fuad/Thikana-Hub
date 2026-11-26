"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";

import { useAuth } from "@/context/AuthContext";

export default function DataManagerEntry({
  children,
}: {
  children: ReactNode;
}) {
  const router = useRouter();
  const { status, user } = useAuth();

  const isAdmin = status === "authenticated" && user?.role === "admin";

  const isDataManager =
    status === "authenticated" &&
    user?.role === "data_manager";

  useEffect(() => {
    if (isAdmin) {
      router.replace("/dashboard/admin/");
    } else if (isDataManager) {
      router.replace("/dashboard/data-manager/");
    }
  }, [isAdmin, isDataManager, router]);

  if (status === "loading" || isDataManager || isAdmin) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="flex items-center gap-3 text-sm text-slate-600">
          <LoaderCircle className="h-6 w-6 animate-spin text-emerald-700" />
          Preparing your workspace...
        </div>
      </main>
    );
  }

  return <>{children}</>;
}
