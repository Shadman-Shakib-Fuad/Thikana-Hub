"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import {
  MapPin,
  LayoutDashboard,
  Database,
  Tags,
  ClipboardList,
  Flag,
  History,
  LogOut,
  Menu,
  X,
  ShieldCheck,
  LoaderCircle,
  AlertCircle,
} from "lucide-react";

import { useAuth } from "@/context/AuthContext";

const navigation = [
  {
    label: "Overview",
    icon: LayoutDashboard,
    href: "/dashboard/data-manager/",
  },
  {
    label: "Localities",
    icon: Database,
    href: "/dashboard/data-manager/localities/",
  },
  {
    label: "Landmarks & Aliases",
    icon: Tags,
    href: "/dashboard/data-manager/terms/",
  },
  {
    label: "My Proposals",
    icon: ClipboardList,
    href: "/dashboard/data-manager/proposals/",
  },
  {
    label: "Escalations",
    icon: Flag,
    href: "/dashboard/data-manager/escalations/",
  },
  {
    label: "Decision History",
    icon: History,
    href: "/dashboard/data-manager/history/",
  },
];

export default function DataManagerShell({
  children,
}: {
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();

  const currentPath =
    (pathname ?? "").replace(/\/$/, "");

  const currentLabel = navigation.find(
    item =>
      item.href &&
      item.href.replace(/\/$/, "") === currentPath
  )?.label ?? "Workspace";

  const {
    user,
    status,
    logout,
    refreshUser,
  } = useAuth();

  const [menuOpen, setMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");

  useEffect(() => {
    if (status === "anonymous") {
      router.replace("/login/");
    }

    if (
      status === "authenticated" &&
      user?.role !== "data_manager"
    ) {
      router.replace("/dashboard/");
    }
  }, [status, user?.role, router]);

  async function handleLogout() {
    if (signingOut) return;

    setSigningOut(true);
    setLogoutError("");

    try {
      await logout();
      router.replace("/login/");
    } catch {
      setLogoutError(
        "Could not sign out. Please try again."
      );
    } finally {
      setSigningOut(false);
    }
  }

  if (status === "error") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <AlertCircle className="mx-auto mb-4 h-10 w-10 text-amber-600" />

          <h1 className="text-xl font-bold text-slate-900">
            Unable to verify session
          </h1>

          <p className="mt-2 text-sm text-slate-500">
            Check your connection and try again.
          </p>

          <button
            type="button"
            onClick={() => void refreshUser()}
            className="mt-6 rounded-xl bg-emerald-700 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-800"
          >
            Retry session
          </button>
        </div>
      </main>
    );
  }

  if (
    status !== "authenticated" ||
    !user ||
    user.role !== "data_manager"
  ) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="flex items-center gap-3 text-sm font-medium text-slate-600">
          <LoaderCircle className="h-6 w-6 animate-spin text-emerald-700" />
          Verifying secure workspace...
        </div>
      </main>
    );
  }

  const initials = user.name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase())
    .join("");

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {menuOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={() => setMenuOpen(false)}
          className="fixed inset-0 z-40 bg-slate-950/50 lg:hidden"
        />
      )}

      <aside
        className={[
          "fixed inset-y-0 left-0 z-50 flex w-72 flex-col",
          "overflow-y-auto bg-slate-900 text-white",
          "transition-transform duration-200",
          "lg:translate-x-0",
          menuOpen
            ? "translate-x-0"
            : "-translate-x-full",
        ].join(" ")}
      >
        <div className="flex items-center gap-3 border-b border-slate-800 p-6">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-600">
            <MapPin className="h-6 w-6" />
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-xl font-bold tracking-tight">
              ThikanaHub
            </p>

            <p className="text-[11px] font-medium uppercase tracking-widest text-slate-400">
              Data Manager
            </p>
          </div>

          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setMenuOpen(false)}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 lg:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav
          aria-label="Data Manager navigation"
          className="flex-1 space-y-2 px-4 py-7"
        >
          <p className="mb-4 px-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
            Workspace
          </p>

          {navigation.map(item => {
            const Icon = item.icon;

            if (!item.href) {
              return (
                <div
                  key={item.label}
                  aria-disabled="true"
                  className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm text-slate-400"
                >
                  <Icon className="h-5 w-5 shrink-0" />

                  <span className="flex-1">
                    {item.label}
                  </span>

                  <span className="text-[10px] text-slate-500">
                    Soon
                  </span>
                </div>
              );
            }

            return (
              <Link
                key={item.label}
                href={item.href}
                aria-current={
                  item.href.replace(/\/$/, "") === currentPath
                    ? "page"
                    : undefined
                }
                onClick={() => setMenuOpen(false)}
                className={[
                  "flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold transition",
                  item.href.replace(/\/$/, "") === currentPath
                    ? "bg-emerald-700 text-white hover:bg-emerald-600"
                    : "text-slate-300 hover:bg-slate-800 hover:text-white",
                ].join(" ")}
              >
                <Icon className="h-5 w-5" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="mx-4 mb-4 rounded-xl border border-slate-800 bg-slate-800/50 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-emerald-300">
            <ShieldCheck className="h-4 w-4" />
            Secure workspace
          </div>

          <p className="mt-2 text-xs leading-relaxed text-slate-400">
            Dataset changes require administrative approval.
          </p>
        </div>

        <div className="border-t border-slate-800 p-4">
          <div className="mb-4 flex items-center gap-3 px-2">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-900 text-sm font-bold text-emerald-200">
              {initials || "DM"}
            </div>

            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">
                {user.name}
              </p>

              <p className="text-xs text-slate-400">
                Data Manager
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={signingOut}
            onClick={() => void handleLogout()}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium text-slate-300 transition hover:bg-slate-800 hover:text-white disabled:opacity-50"
          >
            <LogOut className="h-5 w-5" />

            {signingOut ? "Signing out..." : "Sign out"}
          </button>

          {logoutError && (
            <p role="alert" className="mt-2 text-xs text-red-300">
              {logoutError}
            </p>
          )}
        </div>
      </aside>

      <div className="min-w-0 lg:pl-72">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b border-slate-200 bg-white/95 px-4 backdrop-blur md:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              aria-label="Open navigation"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen(true)}
              className="rounded-lg border border-slate-200 p-2 lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>

            <p className="truncate text-sm text-slate-500">
              Workspace
              <span className="mx-2">/</span>
              <span className="font-semibold text-slate-900">
                {currentLabel}
              </span>
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-emerald-700" />

            <span className="hidden text-xs font-semibold text-slate-600 sm:inline">
              Data Manager
            </span>
          </div>
        </header>

        <main
          key={user.id}
          className="mx-auto max-w-[1600px] p-4 md:p-8"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
