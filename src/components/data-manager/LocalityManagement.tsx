"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";

import {
  Search,
  Plus,
  Pencil,
  Tags,
  RefreshCw,
  MapPin,
} from "lucide-react";

import type {
  LocalityRecord,
  PageResponse,
} from "@/types/data-manager-management";

import LocalityProposalForm from "./LocalityProposalForm";
import TermProposalForm from "./TermProposalForm";

import {
  BASE,
  PageHeading,
  Loading,
  Notice,
  Pager,
  useRemote,
  inputClass,
  panelClass,
  primaryClass,
  secondaryClass,
} from "./ManagementShared";

export default function LocalityManagement({
  mode = "localities",
}: {
  mode?: "localities" | "terms";
}) {
  const isTerms = mode === "terms";

  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [revision, setRevision] = useState(0);

  const [cursors, setCursors] =
    useState<(string | null)[]>([null]);

  const [editor, setEditor] = useState<
    { type: "create" } |
    { type: "edit"; record: LocalityRecord } |
    null
  >(null);

  const [success, setSuccess] = useState("");

  const cursor = cursors.at(-1);

  const params = new URLSearchParams({
    approved: "true",
    limit: "10",
  });

  if (query) params.set("q", query);
  if (cursor) params.set("cursor", cursor);

  const remote = useRemote<PageResponse<LocalityRecord>>(
    `${BASE}/localities?${params}`,
    revision
  );

  function searchRecords(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (editor) return;

    setQuery(search.trim());
    setCursors([null]);
    setRevision(value => value + 1);
  }

  function refresh() {
    setRevision(value => value + 1);
  }

  function submitted(proposalId: string) {
    setEditor(null);

    setSuccess(
      `Proposal ${proposalId} submitted successfully. Awaiting administrative review.`
    );
  }

  return (
    <div className="space-y-6">
      <PageHeading
        title={
          isTerms
            ? "Landmarks & Aliases"
            : "Locality Management"
        }
        description={
          isTerms
            ? "Select an approved locality and propose alternative spellings or landmark changes."
            : "Search the verified address dataset and submit bilingual locality proposals."
        }
      >
        {!isTerms && (
          <button
            type="button"
            disabled={Boolean(editor)}
            className={primaryClass}
            onClick={() => {
              setSuccess("");
              setEditor({ type: "create" });
            }}
          >
            <Plus className="h-4 w-4" />
            New locality proposal
          </button>
        )}
      </PageHeading>

      {success && (
        <div className="space-y-3">
          <Notice message={success} success />

          <Link
            href="/dashboard/data-manager/proposals/"
            className="inline-block text-sm font-semibold text-emerald-700 underline"
          >
            View my proposals
          </Link>
        </div>
      )}

      {editor && (
        isTerms && editor.type === "edit" ? (
          <TermProposalForm
            key={editor.record.localityId}
            selected={editor.record}
            onClose={() => setEditor(null)}
            onSuccess={submitted}
          />
        ) : (
          <LocalityProposalForm
            key={
              editor.type === "edit"
                ? editor.record.localityId
                : "new-locality"
            }
            selected={
              editor.type === "edit"
                ? editor.record
                : null
            }
            onClose={() => setEditor(null)}
            onSuccess={submitted}
          />
        )
      )}

      <section className={`${panelClass} space-y-5`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">
              Approved locality directory
            </h2>

            <p className="mt-1 text-xs text-slate-500">
              Only administrator-approved records are listed here.
            </p>
          </div>

          <button
            type="button"
            className={secondaryClass}
            disabled={remote.loading || Boolean(editor)}
            onClick={refresh}
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>

        <form
          onSubmit={searchRecords}
          className="flex flex-wrap gap-2"
        >
          <div className="relative min-w-[180px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />

            <input
              aria-label="Search localities"
              className={`${inputClass} pl-10`}
              value={search}
              disabled={Boolean(editor)}
              maxLength={100}
              placeholder="Search locality, এলাকা, district, ID..."
              onChange={event => setSearch(event.target.value)}
            />
          </div>

          <button
            type="submit"
            disabled={Boolean(editor)}
            className={primaryClass}
          >
            Search
          </button>

          <button
            type="button"
            disabled={Boolean(editor)}
            className={secondaryClass}
            onClick={() => {
              setSearch("");
              setQuery("");
              setCursors([null]);
              refresh();
            }}
          >
            Clear
          </button>
        </form>

        <Notice message={remote.error} />

        {remote.loading ? (
          <Loading />
        ) : remote.data?.items.length ? (
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Locality</th>
                  <th className="px-4 py-3">Area / District</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Action</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {remote.data.items.map(item => (
                  <tr
                    key={item.localityId}
                    className="hover:bg-slate-50"
                  >
                    <td className="px-4 py-4">
                      <div className="flex items-start gap-3">
                        <MapPin className="mt-1 h-5 w-5 shrink-0 text-emerald-700" />

                        <div>
                          <p className="font-semibold">
                            {item.locality.nameEn}
                          </p>

                          <p lang="bn" className="mt-1 text-slate-600">
                            {item.locality.nameBn}
                          </p>

                          <p className="mt-1 break-all text-xs text-slate-400">
                            {item.localityId}
                          </p>
                        </div>
                      </div>
                    </td>

                    <td className="px-4 py-4 text-slate-600">
                      <p>{item.locality.areaEn}</p>

                      <p className="mt-1 text-xs">
                        {item.locality.districtEn}
                      </p>
                    </td>

                    <td className="px-4 py-4">
                      <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                        Approved
                      </span>
                    </td>

                    <td className="px-4 py-4">
                      <button
                        type="button"
                        className={secondaryClass}
                        disabled={Boolean(editor)}
                        onClick={() => {
                          setSuccess("");
                          setEditor({
                            type: "edit",
                            record: item,
                          });
                        }}
                      >
                        {isTerms
                          ? <Tags className="h-4 w-4" />
                          : <Pencil className="h-4 w-4" />}

                        {isTerms ? "Manage terms" : "Propose edit"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : !remote.error ? (
          <div className="py-12 text-center text-sm text-slate-500">
            No approved localities found.
          </div>
        ) : null}

        <Pager
          pagination={remote.data?.pagination}
          page={cursors.length}
          disabled={remote.loading || Boolean(editor)}
          onPrevious={() =>
            setCursors(previous =>
              previous.length > 1
                ? previous.slice(0, -1)
                : previous
            )
          }
          onNext={() => {
            const next = remote.data?.pagination.nextCursor;

            if (next) {
              setCursors(previous => [...previous, next]);
            }
          }}
        />
      </section>

      <p className="text-xs leading-relaxed text-slate-500">
        ThikanaHub uses an approved reference dataset. Proposal
        submission alone does not establish that an address or
        geographic reference is correct.
      </p>
    </div>
  );
}
