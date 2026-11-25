"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";

import {
  Flag,
  Search,
  RefreshCw,
  ShieldCheck,
  FileSearch,
} from "lucide-react";

import type {
  EscalationRecord,
  EscalationStatisticsResponse,
} from "@/types/escalation";

import type {
  PageResponse,
} from "@/types/data-manager-management";

import EscalationInvestigation from "./EscalationInvestigation";

import {
  BASE,
  PageHeading,
  Notice,
  Loading,
  Pager,
  useRemote,
  formatDate,
  inputClass,
  panelClass,
  primaryClass,
  secondaryClass,
} from "./ManagementShared";

export default function EscalationManagement() {
  const [search, setSearch] = useState("");
  const [jobQuery, setJobQuery] = useState("");

  const [revision, setRevision] = useState(0);

  const [cursors, setCursors] =
    useState<(string | null)[]>([null]);

  const [selected, setSelected] =
    useState<string | null>(null);

  const [searchError, setSearchError] = useState("");
  const [success, setSuccess] = useState("");

  const cursor = cursors.at(-1);

  const params = new URLSearchParams({
    limit: "10",
  });

  if (jobQuery) {
    params.set("jobId", jobQuery);
  } else if (cursor) {
    params.set("cursor", cursor);
  }

  const queue = useRemote<PageResponse<EscalationRecord>>(
    `${BASE}/escalations?${params}`,
    revision
  );

  const statistics =
    useRemote<EscalationStatisticsResponse>(
      `${BASE}/escalations/statistics`,
      revision
    );

  function refresh() {
    if (selected) return;

    setRevision(value => value + 1);
  }

  function submitSearch(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (selected) return;

    const id = search.trim();

    setSearchError("");
    setSuccess("");

    if (id && !/^[a-f0-9]{24}$/i.test(id)) {
      setSearchError("Enter a valid 24-character request ID.");
      return;
    }

    setJobQuery(id);
    setCursors([null]);
    setRevision(value => value + 1);
  }

  function clearSearch() {
    if (selected) return;

    setSearch("");
    setJobQuery("");
    setSearchError("");
    setSuccess("");
    setCursors([null]);

    setRevision(value => value + 1);
  }

  function completeHandoff(jobId: string) {
    setSelected(null);

    setSuccess(
      `Request ${jobId} was returned to its reviewer. A new review decision is required.`
    );

    setCursors([null]);
    setRevision(value => value + 1);
  }

  return (
    <div className="space-y-6">
      <PageHeading
        title="Escalation Management"
        description="Investigate unresolved address requests and return verified findings to the assigned reviewer."
      >
        <button
          type="button"
          className={secondaryClass}
          disabled={
            Boolean(selected) ||
            queue.loading ||
            statistics.loading
          }
          onClick={refresh}
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </PageHeading>

      <Notice message={success} success />

      <section className="grid gap-4 md:grid-cols-2">
        <article className={panelClass}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-500">
                Active escalations
              </p>

              <p className="mt-3 text-3xl font-bold tabular-nums text-rose-700">
                {statistics.data
                  ? statistics.data.summary.totalEscalated
                  : "—"}
              </p>

              <p className="mt-2 text-xs text-slate-500">
                {statistics.loading
                  ? "Loading statistics..."
                  : statistics.error
                    ? "Statistics unavailable."
                    : "System-wide investigation queue"}
              </p>
            </div>

            <div className="rounded-xl bg-rose-50 p-3 text-rose-700">
              <Flag className="h-6 w-6" />
            </div>
          </div>
        </article>

        <article className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-1 h-7 w-7 shrink-0 text-emerald-700" />

            <div>
              <h2 className="font-bold text-emerald-900">
                Protected investigation
              </h2>

              <p className="mt-2 text-sm leading-relaxed text-emerald-800">
                Address data is accessed only when you
                investigate a specific request. Dataset
                changes must follow the approval workflow.
              </p>

              <Link
                href="/dashboard/data-manager/localities/"
                className="mt-3 inline-block text-xs font-semibold text-emerald-800 underline"
              >
                Open locality management
              </Link>
            </div>
          </div>
        </article>
      </section>

      <Notice message={statistics.error} />

      {selected && (
        <EscalationInvestigation
          key={selected}
          jobId={selected}
          onClose={() => setSelected(null)}
          onSuccess={completeHandoff}
        />
      )}

      <section className={`${panelClass} space-y-5`}>
        <div>
          <h2 className="text-lg font-bold">
            Active escalation queue
          </h2>

          <p className="mt-1 text-sm text-slate-500">
            Only requests currently escalated by a reviewer
            are included.
          </p>
        </div>

        <form
          onSubmit={submitSearch}
          className="flex flex-wrap gap-2"
        >
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />

            <input
              aria-label="Search by request ID"
              className={`${inputClass} pl-10`}
              value={search}
              disabled={Boolean(selected)}
              maxLength={24}
              placeholder="Search by exact request ID"
              onChange={event =>
                setSearch(event.target.value)
              }
            />
          </div>

          <button
            type="submit"
            className={primaryClass}
            disabled={Boolean(selected)}
          >
            Search
          </button>

          <button
            type="button"
            className={secondaryClass}
            disabled={Boolean(selected)}
            onClick={clearSearch}
          >
            Clear
          </button>
        </form>

        <Notice message={searchError} />
        <Notice message={queue.error} />

        {queue.loading ? (
          <Loading />
        ) : queue.data?.items.length ? (
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Request ID</th>
                  <th className="px-4 py-3">Escalated</th>
                  <th className="px-4 py-3">Revision</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Action</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {queue.data.items.map(item => (
                  <tr
                    key={item.jobId}
                    className="hover:bg-slate-50"
                  >
                    <td className="px-4 py-4">
                      <p className="break-all font-mono text-xs font-semibold">
                        {item.jobId}
                      </p>
                    </td>

                    <td className="px-4 py-4 text-xs text-slate-600">
                      {formatDate(item.escalatedAt)}
                    </td>

                    <td className="px-4 py-4 tabular-nums">
                      {item.revision}
                    </td>

                    <td className="px-4 py-4">
                      <span className="rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700">
                        Escalated
                      </span>
                    </td>

                    <td className="px-4 py-4">
                      <button
                        type="button"
                        className={secondaryClass}
                        disabled={Boolean(selected)}
                        onClick={() => {
                          setSuccess("");
                          setSelected(item.jobId);
                        }}
                      >
                        <FileSearch className="h-4 w-4" />
                        Investigate
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : !queue.error ? (
          <div className="py-14 text-center">
            <Flag className="mx-auto h-10 w-10 text-slate-300" />

            <h3 className="mt-3 font-semibold">
              {jobQuery
                ? "No matching escalation"
                : "No active escalations"}
            </h3>

            <p className="mt-2 text-sm text-slate-500">
              {jobQuery
                ? "The request may have been returned to a reviewer or may not exist."
                : "Escalated requests will appear here when a reviewer requests further investigation."}
            </p>
          </div>
        ) : null}

        <Pager
          page={cursors.length}
          pagination={queue.data?.pagination}
          disabled={queue.loading || Boolean(selected)}
          onPrevious={() => {
            setCursors(previous =>
              previous.length > 1
                ? previous.slice(0, -1)
                : previous
            );
          }}
          onNext={() => {
            const next = queue.data?.pagination.nextCursor;

            if (next && !jobQuery) {
              setCursors(previous => [...previous, next]);
            }
          }}
        />
      </section>

      <p className="text-xs leading-relaxed text-slate-500">
        ThikanaHub does not automatically confirm escalated
        addresses. A reviewer recommendation and merchant
        acceptance are required.
      </p>
    </div>
  );
}
