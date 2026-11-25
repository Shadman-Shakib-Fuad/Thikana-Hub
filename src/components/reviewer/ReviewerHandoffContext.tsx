"use client";

import { useState } from "react";

import {
  ShieldCheck,
  RefreshCw,
} from "lucide-react";

import type {
  ReviewerHandoffContextResponse,
} from "@/types/escalation";

import {
  useRemote,
  Loading,
  Notice,
  formatDate,
  secondaryClass,
} from "@/components/data-manager/ManagementShared";

function HandoffContextContent({
  jobId,
  assignedAt,
}: {
  jobId: string;
  assignedAt: string;
}) {
  const [revision, setRevision] = useState(0);

  const remote = useRemote<ReviewerHandoffContextResponse>(
    `/p14/reviewer/queue/${encodeURIComponent(jobId)}/handoff-context`,
    revision
  );

  if (remote.loading) {
    return <Loading />;
  }

  if (remote.error) {
    return (
      <section className="space-y-3">
        <Notice message={remote.error} />

        <button
          type="button"
          className={secondaryClass}
          onClick={() => setRevision(value => value + 1)}
        >
          <RefreshCw className="h-4 w-4" />
          Reload handoff context
        </button>
      </section>
    );
  }

  const context = remote.data?.context;

  // Normal first-time reviewer assignments
  // have no Data Manager handoff context.

  if (!context) return null;

  if (context.assignedAt !== assignedAt) {
    return (
      <Notice message="The assignment changed. Refresh the review details before continuing." />
    );
  }

  return (
    <section className="my-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
      <div className="flex items-start gap-3">
        <ShieldCheck className="mt-1 h-6 w-6 shrink-0 text-emerald-700" />

        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
            Data Manager handoff
          </p>

          <h3 className="mt-1 font-bold text-emerald-950">
            Investigation findings
          </h3>

          <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-emerald-900">
            {context.note}
          </p>

          <p className="mt-4 text-xs text-emerald-800">
            Returned: {formatDate(context.handedOffAt)}
          </p>

          <p className="mt-3 text-xs leading-relaxed text-emerald-800">
            Review these findings independently. Submit
            a new recommendation only after verifying the
            approved locality data.
          </p>
        </div>
      </div>
    </section>
  );
}

export default function ReviewerHandoffContext({
  jobId,
  assignedAt,
  reviewStatus,
}: {
  jobId?: string | null;
  assignedAt?: string | null;
  reviewStatus?: string | null;
}) {
  if (
    !jobId ||
    !assignedAt ||
    reviewStatus !== "pending"
  ) {
    return null;
  }

  return (
    <HandoffContextContent
      key={`${jobId}:${assignedAt}`}
      jobId={jobId}
      assignedAt={assignedAt}
    />
  );
}
