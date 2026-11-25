"use client";

import { useState } from "react";

import {
  ClipboardList,
  RefreshCw,
  FileSearch,
  X,
} from "lucide-react";

import type {
  ProposalKind,
} from "@/types/data-manager";

import {
  NAME_FIELDS,
  type PageResponse,
  type ItemResponse,
  type ProposalRecord,
} from "@/types/data-manager-management";

import {
  BASE,
  PageHeading,
  Notice,
  Loading,
  Status,
  Pager,
  useRemote,
  formatDate,
  panelClass,
  secondaryClass,
  primaryClass,
} from "./ManagementShared";

function ProposalDetails({
  kind,
  proposalId,
  onClose,
}: {
  kind: ProposalKind;
  proposalId: string;
  onClose: () => void;
}) {
  const [revision, setRevision] = useState(0);

  const remote = useRemote<ItemResponse<ProposalRecord>>(
    `${BASE}/dataset-proposals/${kind}/${encodeURIComponent(proposalId)}`,
    revision
  );

  const item = remote.data?.item;

  return (
    <section className={`${panelClass} space-y-5`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">
            Proposal details
          </h2>

          <p className="mt-1 break-all text-xs text-slate-500">
            {proposalId}
          </p>
        </div>

        <button
          type="button"
          aria-label="Close proposal details"
          onClick={onClose}
          className="rounded-lg p-2 hover:bg-slate-100"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {remote.loading && <Loading />}

      {remote.error && (
        <>
          <Notice message={remote.error} />

          <button
            type="button"
            className={secondaryClass}
            onClick={() => setRevision(value => value + 1)}
          >
            Retry
          </button>
        </>
      )}

      {item && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <Status value={item.status} />

            <span className="text-sm font-semibold capitalize">
              {kind} · {item.operation}
            </span>
          </div>

          <div className="rounded-xl bg-slate-50 p-4">
            <p className="text-xs font-semibold text-slate-500">
              Locality ID
            </p>

            <p className="mt-1 break-all text-sm font-semibold">
              {item.localityId}
            </p>

            <p className="mt-3 text-xs text-slate-500">
              Submitted: {formatDate(item.createdAt)}
            </p>
          </div>

          {kind === "locality" && item.locality && (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full min-w-[500px] text-left text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Field</th>
                    <th className="px-4 py-3">Previous</th>
                    <th className="px-4 py-3">Proposed</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100">
                  {NAME_FIELDS.map(([key, label]) => (
                    <tr key={key}>
                      <td className="px-4 py-3 font-medium">
                        {label}
                      </td>

                      <td className="px-4 py-3 text-slate-500">
                        {item.baseLocality?.[key] ?? "—"}
                      </td>

                      <td className="px-4 py-3 font-medium text-slate-900">
                        {item.locality?.[key]}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {kind === "term" && (
            <div className="space-y-3 rounded-xl border border-slate-200 p-4">
              <p className="text-sm">
                <strong>Field:</strong> {item.field}
              </p>

              <p className="break-words text-sm">
                <strong>Proposed term:</strong> {item.term}
              </p>

              <p className="text-xs font-semibold text-slate-500">
                Previous terms
              </p>

              <div className="flex flex-wrap gap-2">
                {item.baseTerms?.length ? (
                  item.baseTerms.map((term, index) => (
                    <span
                      key={`${term}-${index}`}
                      className="max-w-full break-words rounded-lg bg-slate-100 px-3 py-1.5 text-xs"
                    >
                      {term}
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-slate-500">
                    No previous terms.
                  </span>
                )}
              </div>
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-slate-200 p-4">
              <h3 className="text-sm font-bold">
                Submission reason
              </h3>

              <p className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-600">
                {item.reason}
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 p-4">
              <h3 className="text-sm font-bold">
                Supporting evidence
              </h3>

              <p className="mt-2 whitespace-pre-wrap break-all text-sm text-slate-600">
                {item.evidence}
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 p-5">
            <h3 className="font-bold">
              Administrative decision
            </h3>

            {item.decision ? (
              <div className="mt-4 space-y-3 text-sm">
                <Status value={item.status} />

                <p className="whitespace-pre-wrap break-words text-slate-700">
                  {item.decision.reason}
                </p>

                <p className="text-xs text-slate-500">
                  Decided: {formatDate(item.decision.decidedAt)}
                </p>

                <p className="font-medium">
                  {item.decision.published
                    ? "Changes were published to the dataset."
                    : "This decision did not publish changes."}
                </p>
              </div>
            ) : (
              <p className="mt-3 text-sm text-slate-500">
                {item.status === "pending"
                  ? "Awaiting administrative review."
                  : "Decision details are unavailable."}
              </p>
            )}
          </div>

          <button
            type="button"
            className={secondaryClass}
            onClick={() => setRevision(value => value + 1)}
          >
            Refresh decision
          </button>
        </>
      )}
    </section>
  );
}

export default function ProposalManagement({
  history = false,
}: {
  history?: boolean;
}) {
  const [kind, setKind] =
    useState<ProposalKind>("locality");

  const [cursors, setCursors] =
    useState<(string | null)[]>([null]);

  const [revision, setRevision] = useState(0);

  const [selected, setSelected] =
    useState<string | null>(null);

  const cursor = cursors.at(-1);

  const params = new URLSearchParams({
    limit: "10",
  });

  if (cursor) params.set("cursor", cursor);

  const path = kind === "locality"
    ? "locality-proposals"
    : "term-proposals";

  const remote = useRemote<PageResponse<ProposalRecord>>(
    `${BASE}/${path}?${params}`,
    revision
  );

  const records = remote.data?.items ?? [];

  // The existing locality proposal endpoint does
  // not provide a server-side status filter.

  const items = history
    ? records.filter(item =>
        item.status === "approved" ||
        item.status === "rejected"
      )
    : records;

  function changeKind(value: ProposalKind) {
    setKind(value);
    setSelected(null);
    setCursors([null]);
    setRevision(previous => previous + 1);
  }

  return (
    <div className="space-y-6">
      <PageHeading
        title={history ? "Decision History" : "My Proposals"}
        description={
          history
            ? "Review your approved and rejected proposals and administrative decision reasons."
            : "Track your own locality, alias and landmark submissions."
        }
      >
        <button
          type="button"
          className={secondaryClass}
          disabled={remote.loading}
          onClick={() =>
            setRevision(value => value + 1)
          }
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </PageHeading>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          aria-pressed={kind === "locality"}
          className={
            kind === "locality"
              ? primaryClass
              : secondaryClass
          }
          onClick={() => changeKind("locality")}
        >
          Locality proposals
        </button>

        <button
          type="button"
          aria-pressed={kind === "term"}
          className={
            kind === "term"
              ? primaryClass
              : secondaryClass
          }
          onClick={() => changeKind("term")}
        >
          Landmark & alias proposals
        </button>
      </div>

      {selected && (
        <ProposalDetails
          key={`${kind}-${selected}`}
          kind={kind}
          proposalId={selected}
          onClose={() => setSelected(null)}
        />
      )}

      <section className={`${panelClass} space-y-5`}>
        <div>
          <h2 className="text-lg font-bold">
            {history ? "Completed decisions" : "Submitted proposals"}
          </h2>

          <p className="mt-1 text-xs text-slate-500">
            {history
              ? "Showing decided proposals on the current submission page. Older decisions may be on later pages."
              : "Only proposals submitted by your account are displayed."}
          </p>
        </div>

        <Notice message={remote.error} />

        {remote.loading ? (
          <Loading />
        ) : items.length ? (
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[650px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Locality</th>
                  <th className="px-4 py-3">Operation</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Submitted</th>
                  <th className="px-4 py-3">Action</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {items.map(item => (
                  <tr
                    key={item.proposalId}
                    className="hover:bg-slate-50"
                  >
                    <td className="px-4 py-4">
                      <p className="font-semibold">
                        {item.locality?.nameEn ?? item.localityId}
                      </p>

                      {item.term && (
                        <p className="mt-1 max-w-52 break-words text-xs text-slate-500">
                          {item.term}
                        </p>
                      )}

                      <p className="mt-1 break-all text-xs text-slate-400">
                        {item.proposalId}
                      </p>
                    </td>

                    <td className="px-4 py-4 capitalize">
                      {item.operation}
                    </td>

                    <td className="px-4 py-4">
                      <Status value={item.status} />
                    </td>

                    <td className="px-4 py-4 text-xs text-slate-500">
                      {formatDate(item.createdAt)}
                    </td>

                    <td className="px-4 py-4">
                      <button
                        type="button"
                        className={secondaryClass}
                        onClick={() =>
                          setSelected(item.proposalId)
                        }
                      >
                        <FileSearch className="h-4 w-4" />
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : !remote.error ? (
          <div className="py-12 text-center">
            <ClipboardList className="mx-auto h-10 w-10 text-slate-300" />

            <h3 className="mt-3 font-semibold">
              {history
                ? "No completed decisions on this page"
                : "No proposals on this page"}
            </h3>

            <p className="mt-2 text-sm text-slate-500">
              {remote.data?.pagination.hasMore
                ? "Use Next to view older submissions."
                : "No more submissions are available."}
            </p>
          </div>
        ) : null}

        <Pager
          page={cursors.length}
          pagination={remote.data?.pagination}
          disabled={remote.loading}
          onPrevious={() => {
            setSelected(null);

            setCursors(previous =>
              previous.length > 1
                ? previous.slice(0, -1)
                : previous
            );
          }}
          onNext={() => {
            const next = remote.data?.pagination.nextCursor;

            if (next) {
              setSelected(null);

              setCursors(previous => [
                ...previous,
                next,
              ]);
            }
          }}
        />
      </section>
    </div>
  );
}
