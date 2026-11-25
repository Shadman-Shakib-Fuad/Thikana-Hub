"use client";

import Link from "next/link";

import {
  useEffect,
  useState,
  type ReactNode,
} from "react";

import { useRouter } from "next/navigation";

import {
  MapPin,
  LayoutDashboard,
  ScanSearch,
  History,
  Bookmark,
  BarChart3,
  FileText,
  ShieldCheck,
  LogOut,
  Loader2,
  AlertCircle,
  RefreshCw,
  House,
} from "lucide-react";

import { useAuth } from "@/context/AuthContext";

import { ROLE_LABELS } from "@/types/auth";

// =====================================
// DASHBOARD TYPES
// =====================================

interface DashboardShellProps {
  children: ReactNode;

  active:
    | "overview"
    | "resolve"
    | "history"
    | "saved"
    | "analytics"
    | "reports";
}

const pageTitles = {
  overview: "Overview",
  resolve: "Address Resolver",
  history: "Search History",
  saved: "Saved Addresses",
  analytics: "Merchant Analytics",
  reports: "Analytics Reports",
};

// =====================================
// MAIN DASHBOARD SHELL
// =====================================

export default function DashboardShell({
  children,
  active,
}: DashboardShellProps) {
  const router = useRouter();

  const {
    user,
    status,
    logout,
    refreshUser,
  } = useAuth();

  const [logoutLoading, setLogoutLoading] =
    useState(false);

  const [logoutError, setLogoutError] =
    useState("");

  // =================================
  // SESSION PROTECTION
  // =================================

  useEffect(() => {
    if (status === "anonymous") {
      router.replace("/login/");
    }
  }, [status, router]);

  // =================================
  // LOGOUT
  // =================================

  async function handleLogout() {
    if (logoutLoading) return;

    setLogoutError("");
    setLogoutLoading(true);

    try {
      await logout();

      router.replace("/login/");

    } catch (error) {
      setLogoutError(
        error instanceof Error
          ? error.message
          : "Unable to sign out."
      );

    } finally {
      setLogoutLoading(false);
    }
  }

  // =================================
  // AUTHENTICATION LOADING
  // =================================

  if (
    status === "loading" ||
    status === "anonymous"
  ) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">

        <div className="text-center">

          <Loader2
            size={40}
            className="mx-auto mb-4 animate-spin text-emerald-600"
          />

          <p className="font-semibold text-slate-700">
            Verifying your session...
          </p>

        </div>

      </div>
    );
  }

  // =================================
  // CONNECTION ERROR
  // =================================

  if (status === "error" || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">

        <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">

          <AlertCircle
            size={44}
            className="mx-auto mb-4 text-amber-500"
          />

          <h2 className="text-xl font-bold text-slate-900">
            Connection unavailable
          </h2>

          <p className="mt-2 text-sm text-slate-500">
            We could not verify your session.
          </p>

          <button
            type="button"
            onClick={() => void refreshUser()}
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-5 py-3 font-semibold text-white hover:bg-emerald-800"
          >
            <RefreshCw size={18} />

            Try Again
          </button>

        </div>

      </div>
    );
  }

  // =================================
  // USER INFORMATION
  // =================================

  const isMerchant =
    user.role === "merchant";

  const initials = user.name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(
      (word) => word[0]?.toUpperCase()
    )
    .join("");

  const navClass = (selected: boolean) =>
    `flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition ${
      selected
        ? "bg-emerald-700 text-white"
        : "text-slate-300 hover:bg-slate-800 hover:text-white"
    }`;

  // =================================
  // MERCHANT NAVIGATION
  // =================================

  const merchantNavigation = [
    {
      id: "resolve",
      href: "/dashboard/resolve/",
      label: "Resolve Address",
      icon: ScanSearch,
    },

    {
      id: "history",
      href: "/dashboard/history/",
      label: "Search History",
      icon: History,
    },

    {
      id: "saved",
      href: "/dashboard/saved/",
      label: "Saved Addresses",
      icon: Bookmark,
    },

    {
      id: "analytics",
      href: "/dashboard/analytics/",
      label: "Analytics",
      icon: BarChart3,
    },

    {
      id: "reports",
      href: "/dashboard/reports/",
      label: "Reports",
      icon: FileText,
    },
  ] as const;

  return (
    <div className="min-h-screen bg-slate-50 lg:flex">

      {/* =================================
          SIDEBAR
      ================================= */}

      <aside className="flex w-full flex-col bg-slate-900 text-white lg:sticky lg:top-0 lg:h-screen lg:w-64 lg:shrink-0 lg:overflow-y-auto">

        {/* Brand Logo */}

        <Link
          href="/"
          className="flex items-center gap-3 px-6 py-6"
        >

          <div className="rounded-xl bg-emerald-600 p-2.5">
            <MapPin size={23} />
          </div>

          <div>

            <h1 className="text-xl font-bold">
              ThikanaHub
            </h1>

            <p className="text-xs text-slate-400">
              Secure Address Workspace
            </p>

          </div>

        </Link>

        <div className="mx-5 border-t border-slate-800" />

        {/* Navigation */}

        <nav
          aria-label="Dashboard navigation"
          className="flex flex-wrap gap-2 p-4 lg:flex-col"
        >

          <p className="hidden px-4 pb-2 pt-3 text-xs font-semibold tracking-widest text-slate-500 lg:block">
            WORKSPACE
          </p>

          {/* Overview */}

          <Link
            href="/dashboard/"

            aria-current={
              active === "overview"
                ? "page"
                : undefined
            }

            className={navClass(
              active === "overview"
            )}
          >

            <LayoutDashboard size={20} />

            Overview

          </Link>

          {/* Merchant-only navigation */}

          {isMerchant &&
            merchantNavigation.map((item) => {
              const Icon = item.icon;

              return (
                <Link
                  key={item.id}

                  href={item.href}

                  aria-current={
                    active === item.id
                      ? "page"
                      : undefined
                  }

                  className={navClass(
                    active === item.id
                  )}
                >

                  <Icon size={20} />

                  {item.label}

                </Link>
              );
            })}

          {/* Homepage */}

          <Link
            href="/"
            className={navClass(false)}
          >

            <House size={20} />

            Homepage

          </Link>

        </nav>

        {/* =================================
            ACCOUNT INFORMATION
        ================================= */}

        <div className="mt-auto border-t border-slate-800 p-4">

          <div className="mb-4 flex items-center gap-3 rounded-xl bg-slate-800 p-3">

            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-700 font-bold">

              {initials}

            </div>

            <div className="min-w-0">

              <p className="truncate text-sm font-semibold">
                {user.name}
              </p>

              <p className="text-xs text-slate-400">
                {ROLE_LABELS[user.role]}
              </p>

            </div>

          </div>

          {/* Logout Button */}

          <button
            type="button"
            disabled={logoutLoading}
            onClick={() => void handleLogout()}
            className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-slate-300 transition hover:bg-red-500/10 hover:text-red-400 disabled:opacity-50"
          >

            {logoutLoading ? (
              <Loader2
                size={20}
                className="animate-spin"
              />
            ) : (
              <LogOut size={20} />
            )}

            {logoutLoading
              ? "Signing out..."
              : "Sign Out"}

          </button>

          {logoutError && (
            <p
              role="alert"
              className="mt-2 text-xs text-red-300"
            >
              {logoutError}
            </p>
          )}

        </div>

      </aside>

      {/* =================================
          MAIN CONTENT AREA
      ================================= */}

      <div className="min-w-0 flex-1">

        {/* Dashboard Header */}

        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-4 sm:px-8">

          <div>

            <p className="text-xs font-medium text-slate-400">
              Workspace / Dashboard
            </p>

            <p className="mt-1 text-sm font-semibold text-slate-800">

              {pageTitles[active]}

            </p>

          </div>

          <div className="flex items-center gap-2 rounded-full border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">

            <ShieldCheck size={16} />

            Authenticated session

          </div>

        </header>

        {/* Protected Content */}

        <main
          key={`${user.id}:${active}`}
          className="mx-auto max-w-7xl p-4 sm:p-8"
        >

          {active !== "overview" && !isMerchant ? (

            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6">

              <AlertCircle className="mb-3 text-amber-600" />

              <h2 className="font-bold text-amber-900">
                Access restricted
              </h2>

              <p className="mt-2 text-sm text-amber-800">
                Address management, analytics and reports
                are available to merchant accounts only.
              </p>

              <Link
                href="/dashboard/"
                className="mt-4 inline-block text-sm font-semibold text-emerald-700"
              >

                Return to overview

              </Link>

            </div>

          ) : (

            children

          )}

        </main>

      </div>

    </div>
  );
}