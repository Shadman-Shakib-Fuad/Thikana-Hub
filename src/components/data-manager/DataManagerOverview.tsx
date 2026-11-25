"use client";

import { useEffect, useState } from "react";

import {
  Database,
  Clock3,
  CheckCircle2,
  Flag,
  FileText,
  RefreshCw,
  AlertCircle,
  ShieldCheck,
  ArrowUpRight,
} from "lucide-react";

import {
  apiRequest,
  ApiError,
} from "@/services/api";

import type {
  DataManagerDashboardResponse,
  ProposalStatus,
} from "@/types/data-manager";

const numberFormat = new Intl.NumberFormat("en-BD");

function formatDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "Unavailable";

  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Dhaka",
  }).format(date);
}

const statusStyles: Record<ProposalStatus, string> = {
  pending: "bg-amber-50 text-amber-700",
  approved: "bg-emerald-50 text-emerald-700",
  rejected: "bg-red-50 text-red-700",
};

export default function DataManagerOverview() {
  const [data, setData] =
    useState<DataManagerDashboardResponse | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    apiRequest<DataManagerDashboardResponse>(
      "/p14/data-manager/dashboard",
      { method: "GET" }
    )
      .then(result => {
        if (!cancelled) setData(result);
      })
      .catch((err: unknown) => {
        if (cancelled) return;

        if (err instanceof ApiError) {
          setError(
            err.status === 401
              ? "Your session has expired. Sign in again."
              : err.status === 403
                ? "You do not have permission to view this workspace."
                : err.message
          );
        } else {
          setError("Unable to load dashboard statistics.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  function refresh() {
    setLoading(true);
    setError("");
    setData(null);
    setRefreshKey(previous => previous + 1);
  }

  const summary = data?.summary;

  const cards = [
    {
      title: "Approved localities",
      value: summary?.approvedLocalities,
      description: summary
        ? `Out of ${numberFormat.format(summary.totalLocalities)} dataset records`
        : "Verified address dataset",
      icon: Database,
      style: "bg-emerald-50 text-emerald-700",
    },
    {
      title: "Pending proposals",
      value: summary?.proposals.pending,
      description: "Awaiting administrative review",
      icon: Clock3,
      style: "bg-amber-50 text-amber-700",
    },
    {
      title: "Active escalations",
      value: summary?.totalEscalated,
      description: "System-wide investigation queue",
      icon: Flag,
      style: "bg-rose-50 text-rose-700",
    },
    {
      title: "Approved proposals",
      value: summary?.proposals.approved,
      description: "Your published contributions",
      icon: CheckCircle2,
      style: "bg-blue-50 text-blue-700",
    },
  ];

  const proposalStats = [
    {
      label: "Pending",
      value: summary?.proposals.pending ?? 0,
      color: "bg-amber-500",
      dot: "bg-amber-500",
    },
    {
      label: "Approved",
      value: summary?.proposals.approved ?? 0,
      color: "bg-emerald-600",
      dot: "bg-emerald-600",
    },
    {
      label: "Rejected",
      value: summary?.proposals.rejected ?? 0,
      color: "bg-rose-500",
      dot: "bg-rose-500",
    },
  ];

  return (
    <div className="space-y-7">
      <section className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-700">
            <ShieldCheck className="h-4 w-4" />
            Dataset management
          </div>

          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Data Manager Dashboard
          </h1>

          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-500">
            Monitor verified address data, track your proposals
            and manage escalated review requests.
          </p>
        </div>

        <button
          type="button"
          disabled={loading}
          onClick={refresh}
          className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-100 disabled:opacity-60"
        >
          <RefreshCw
            className={[
              "h-4 w-4",
              loading ? "animate-spin" : "",
            ].join(" ")}
          />

          {loading ? "Loading..." : "Refresh"}
        </button>
      </section>

      {error && (
        <section
          role="alert"
          className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-red-800"
        >
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />

          <div>
            <p className="font-semibold">
              Dashboard unavailable
            </p>

            <p className="mt-1 text-sm">{error}</p>

            <button
              type="button"
              onClick={refresh}
              className="mt-3 text-sm font-semibold underline"
            >
              Try again
            </button>
          </div>
        </section>
      )}

      <section
        aria-label="Dashboard statistics"
        aria-busy={loading}
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        {cards.map(card => {
          const Icon = card.icon;

          return (
            <article
              key={card.title}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <div className="flex items-start justify-between">
                <div className={`rounded-xl p-3 ${card.style}`}>
                  <Icon className="h-5 w-5" />
                </div>

                <ArrowUpRight className="h-4 w-4 text-slate-300" />
              </div>

              <p className="mt-5 text-sm font-medium text-slate-500">
                {card.title}
              </p>

              {loading ? (
                <div className="mt-3 h-9 w-20 animate-pulse rounded-lg bg-slate-200" />
              ) : (
                <p className="mt-2 text-3xl font-bold tabular-nums tracking-tight">
                  {card.value === undefined
                    ? "—"
                    : numberFormat.format(card.value)}
                </p>
              )}

              <p className="mt-3 text-xs leading-relaxed text-slate-500">
                {card.description}
              </p>
            </article>
          );
        })}
      </section>

      <section className="grid gap-5 xl:grid-cols-3">
        <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm xl:col-span-2">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold">
                My proposal overview
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                Locality, alias and landmark submissions
              </p>
            </div>

            <FileText className="h-6 w-6 text-slate-400" />
          </div>

          <p className="mt-6 text-3xl font-bold">
            {summary
              ? numberFormat.format(summary.proposals.total)
              : "—"}
          </p>

          <p className="mt-1 text-xs text-slate-500">
            Total submissions
          </p>

          {summary ? (
            <>
              <div
                aria-label="Proposal status distribution"
                className="mt-6 flex h-3 overflow-hidden rounded-full bg-slate-100"
              >
                {proposalStats.map(item => (
                  <div
                    key={item.label}
                    className={item.color}
                    style={{
                      width: `${
                        summary.proposals.total > 0
                          ? item.value / summary.proposals.total * 100
                          : 0
                      }%`,
                    }}
                  />
                ))}
              </div>

              <div className="mt-6 space-y-4">
                {proposalStats.map(item => (
                  <div
                    key={item.label}
                    className="flex items-center justify-between text-sm"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`h-2.5 w-2.5 rounded-full ${item.dot}`}
                      />
                      {item.label}
                    </div>

                    <span className="font-semibold tabular-nums">
                      {numberFormat.format(item.value)}
                    </span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="mt-6 text-sm text-slate-500">
              {loading
                ? "Loading proposal statistics..."
                : "Statistics are currently unavailable."}
            </p>
          )}
        </article>

        <article className="rounded-2xl border border-emerald-800 bg-emerald-950 p-6 text-white shadow-sm">
          <ShieldCheck className="h-9 w-9 text-emerald-300" />

          <h2 className="mt-5 text-xl font-bold">
            Verified data workflow
          </h2>

          <p className="mt-3 text-sm leading-relaxed text-emerald-100/80">
            Address dataset changes are reviewed before publication.
            Your proposals do not directly modify live address data.
          </p>

          <div className="mt-6 space-y-3 text-sm">
            {[
              "Role-based authorization",
              "Administrative approval",
              "Transactional publication",
              "Audited decisions",
            ].map(item => (
              <div key={item} className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-300" />
                {item}
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 p-6">
          <h2 className="text-lg font-bold">
            Recent proposals
          </h2>

          <p className="mt-1 text-sm text-slate-500">
            Your five most recent submissions
          </p>
        </div>

        {loading ? (
          <div className="space-y-4 p-6">
            {[1, 2, 3].map(item => (
              <div
                key={item}
                className="h-12 animate-pulse rounded-xl bg-slate-100"
              />
            ))}
          </div>
        ) : data && data.recentProposals.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[660px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-6 py-4">Locality</th>
                  <th className="px-6 py-4">Type</th>
                  <th className="px-6 py-4">Operation</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Submitted</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {data.recentProposals.map(item => (
                  <tr
                    key={item.proposalId}
                    className="hover:bg-slate-50"
                  >
                    <td className="px-6 py-4 font-medium">
                      {item.localityId}
                    </td>

                    <td className="px-6 py-4 capitalize text-slate-600">
                      {item.field ?? item.kind}
                    </td>

                    <td className="px-6 py-4 capitalize text-slate-600">
                      {item.operation}
                    </td>

                    <td className="px-6 py-4">
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${statusStyles[item.status] ?? "bg-slate-100 text-slate-600"}`}>
                        {item.status}
                      </span>
                    </td>

                    <td className="px-6 py-4 text-xs text-slate-500">
                      {formatDate(item.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-6 py-14 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100">
              <FileText className="h-7 w-7 text-slate-400" />
            </div>

            <h3 className="mt-4 font-semibold">
              {data ? "No proposals yet" : "No data available"}
            </h3>

            <p className="mt-2 text-sm text-slate-500">
              {data
                ? "Your submitted proposals will appear here."
                : "Refresh the dashboard to retrieve your proposals."}
            </p>
          </div>
        )}
      </section>

      <footer className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
        <span>ThikanaHub • Secure Data Management</span>

        {data && (
          <span>
            Last updated: {formatDate(data.generatedAt)} (BD)
          </span>
        )}
      </footer>
    </div>
  );
}
