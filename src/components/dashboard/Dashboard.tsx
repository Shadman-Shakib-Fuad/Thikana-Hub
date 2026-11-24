"use client";

import Link from "next/link";

import {
  ScanSearch,
  ShieldCheck,
  UserRound,
  ArrowRight,
  Database,
  RefreshCw,
} from "lucide-react";

import { useAuth } from "@/context/AuthContext";

import { ROLE_LABELS } from "@/types/auth";

import DashboardShell from "./DashboardShell";

function DashboardOverview() {
  const { user, refreshUser } = useAuth();

  if (!user) return null;

  const isMerchant = user.role === "merchant";

  return (
    <div className="space-y-8">

      {/* Welcome Banner */}
      <section className="relative overflow-hidden rounded-3xl bg-linear-to-br from-emerald-800 to-emerald-600 p-6 text-white sm:p-9">

        <div className="absolute -right-16 -top-20 h-72 w-72 rounded-full bg-white/10" />

        <div className="relative">
          <p className="mb-3 text-sm font-medium text-emerald-100">
            YOUR SECURE WORKSPACE
          </p>

          <h2 className="text-3xl font-bold sm:text-4xl">
            Welcome, {user.name}!
          </h2>

          <p className="mt-3 max-w-xl text-sm leading-relaxed text-emerald-100 sm:text-base">
            Resolve incomplete addresses and manage
            your address workflow securely with
            ThikanaHub.
          </p>

          {isMerchant && (
            <Link
              href="/dashboard/resolve/"
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-bold text-emerald-800 transition hover:bg-emerald-50"
            >
              Resolve an Address
              <ArrowRight size={18} />
            </Link>
          )}
        </div>
      </section>

      {/* System Features */}
      <section className="grid gap-4 md:grid-cols-3">

        <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 w-fit rounded-xl bg-emerald-50 p-3 text-emerald-700">
            <ScanSearch size={25} />
          </div>

          <h3 className="font-bold text-slate-900">
            Intelligent Matching
          </h3>

          <p className="mt-2 text-sm leading-relaxed text-slate-500">
            Multilingual address normalization and
            ranked locality suggestions.
          </p>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 w-fit rounded-xl bg-blue-50 p-3 text-blue-700">
            <ShieldCheck size={25} />
          </div>

          <h3 className="font-bold text-slate-900">
            Secure Authentication
          </h3>

          <p className="mt-2 text-sm leading-relaxed text-slate-500">
            Protected sessions and role-based
            access controls.
          </p>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 w-fit rounded-xl bg-violet-50 p-3 text-violet-700">
            <Database size={25} />
          </div>

          <h3 className="font-bold text-slate-900">
            Encrypted Storage
          </h3>

          <p className="mt-2 text-sm leading-relaxed text-slate-500">
            Private address fields are protected
            with AES-256-GCM encryption at rest.
          </p>
        </article>
      </section>

      {/* User Profile */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">

        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">

            <div className="rounded-xl bg-slate-100 p-3 text-slate-700">
              <UserRound size={24} />
            </div>

            <div>
              <h2 className="text-lg font-bold text-slate-900">
                Account Information
              </h2>

              <p className="text-sm text-slate-500">
                Your current account details
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void refreshUser()}
            className="flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            <RefreshCw size={16} />
            Refresh
          </button>
        </div>

        <dl className="grid gap-5 sm:grid-cols-2">

          <div className="min-w-0 rounded-xl bg-slate-50 p-4">
            <dt className="text-xs text-slate-500">
              Full Name
            </dt>

            <dd className="mt-1 break-words font-semibold text-slate-800">
              {user.name}
            </dd>
          </div>

          <div className="min-w-0 rounded-xl bg-slate-50 p-4">
            <dt className="text-xs text-slate-500">
              Email Address
            </dt>

            <dd className="mt-1 break-all font-semibold text-slate-800">
              {user.email}
            </dd>
          </div>

          <div className="rounded-xl bg-slate-50 p-4">
            <dt className="text-xs text-slate-500">
              Account Role
            </dt>

            <dd className="mt-1 font-semibold text-emerald-700">
              {ROLE_LABELS[user.role]}
            </dd>
          </div>

          <div className="rounded-xl bg-slate-50 p-4">
            <dt className="text-xs text-slate-500">
              Account Status
            </dt>

            <dd className="mt-1 font-semibold capitalize text-slate-800">
              {user.status}
            </dd>
          </div>

          <div className="rounded-xl bg-slate-50 p-4">
            <dt className="text-xs text-slate-500">
              Member Since
            </dt>

            <dd className="mt-1 font-semibold text-slate-800">
              {new Date(user.createdAt).toLocaleDateString(
                "en-GB",
                {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                }
              )}
            </dd>
          </div>

        </dl>
      </section>
    </div>
  );
}

export function Dashboard() {
  return (
    <DashboardShell active="overview">
      <DashboardOverview />
    </DashboardShell>
  );
}

export default Dashboard;