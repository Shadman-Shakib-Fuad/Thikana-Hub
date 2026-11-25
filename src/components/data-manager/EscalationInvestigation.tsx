"use client";

import { useRef, useState, type FormEvent } from "react";

import {
  ShieldCheck,
  LockKeyhole,
  Send,
  RefreshCw,
  X,
} from "lucide-react";

import { apiRequest } from "@/services/api";

import type {
  EscalationInvestigation as Investigation,
  HandoffResponse,
} from "@/types/escalation";

import type {
  ItemResponse,
} from "@/types/data-manager-management";

import {
  BASE,
  Field,
  Notice,
  Loading,
  useRemote,
  errorMessage,
  formatDate,
  inputClass,
  panelClass,
  primaryClass,
  secondaryClass,
} from "./ManagementShared";

export default function EscalationInvestigation({
  jobId,
  onClose,
  onSuccess,
}: {
  jobId: string;
  onClose: () => void;
  onSuccess: (jobId: string) => void;
}) {
  const endpoint =
    `${BASE}/escalations/${encodeURIComponent(jobId)}`;

  const [revision, setRevision] = useState(0);

  const remote = useRemote<ItemResponse<Investigation>>(
    `${endpoint}/investigation`,
    revision
  );

  const [note, setNote] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [needsRefresh, setNeedsRefresh] = useState(false);

  const inFlight = useRef(false);

  const item = remote.data?.item;

  function refresh() {
    if (inFlight.current) return;

    setNote("");
    setConfirmed(false);
    setError("");
    setNeedsRefresh(false);

    setRevision(value => value + 1);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (
      inFlight.current ||
      needsRefresh ||
      !item ||
      remote.loading
    ) {
      return;
    }

    setError("");

    const findings = note.trim();

    if (
      findings.length < 10 ||
      findings.length > 1000
    ) {
      setError(
        "Investigation findings must contain 10–1000 characters."
      );

      return;
    }

    if (
      item.jobId !== jobId ||
      item.reviewStatus !== "escalated" ||
      !/^[a-f0-9]{64}$/.test(item.version)
    ) {
      setError("Invalid investigation state. Refresh before continuing.");
      setNeedsRefresh(true);
      return;
    }

    if (!confirmed) {
      setError("Confirm that you have reviewed the investigation findings.");
      return;
    }

    inFlight.current = true;
    setSaving(true);

    try {
      const result = await apiRequest<HandoffResponse>(
        `${endpoint}/handoff`,

        {
          method: "POST",

          body: {
            revision: item.revision,
            version: item.version,
            note: findings,
          },
        }
      );

      if (
        result.jobId !== jobId ||
        result.reviewStatus !== "pending"
      ) {
        throw new Error(
          "The handoff response could not be verified."
        );
      }

      setNote("");
      setConfirmed(false);

      onSuccess(result.jobId);

    } catch (err) {
      setError(
        `${errorMessage(err)} Refresh the investigation before attempting another handoff.`
      );

      // A network failure may occur after a
      // successful server-side commit.
      // Never retry the mutation automatically.

      setNeedsRefresh(true);
      setConfirmed(false);

    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }

  return (
    <section className={`${panelClass} space-y-5`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase text-emerald-700">
            <LockKeyhole className="h-4 w-4" />
            Restricted address data
          </div>

          <h2 className="text-xl font-bold">
            Secure investigation
          </h2>

          <p className="mt-2 break-all text-xs text-slate-500">
            Request ID: {jobId}
          </p>
        </div>

        <button
          type="button"
          aria-label="Close investigation"
          disabled={saving}
          onClick={onClose}
          className="rounded-lg p-2 hover:bg-slate-100 disabled:opacity-50"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {remote.loading && <Loading />}

      {remote.error && (
        <div className="space-y-3">
          <Notice message={remote.error} />

          <button
            type="button"
            className={secondaryClass}
            onClick={refresh}
          >
            <RefreshCw className="h-4 w-4" />
            Reload investigation
          </button>
        </div>
      )}

      {item && (
        <form onSubmit={submit} className="space-y-5">
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            Access is restricted to authorized personnel.
            Address investigation access is audited.
            Do not copy private address information outside this workspace.
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="min-w-0 rounded-xl border border-slate-200 p-4">
              <h3 className="text-sm font-semibold text-slate-500">
                Original address
              </h3>

              <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-800">
                {item.originalAddress}
              </p>
            </div>

            <div className="min-w-0 rounded-xl border border-slate-200 p-4">
              <h3 className="text-sm font-semibold text-slate-500">
                Previous reviewer note
              </h3>

              <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-800">
                {item.reviewerNote}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-4 text-xs text-slate-500">
            <span>
              Escalated: {formatDate(item.escalatedAt)}
            </span>

            <span>
              Address revision: {item.revision}
            </span>
          </div>

          <Field label="Investigation findings">
            <textarea
              className={inputClass}
              value={note}
              disabled={saving || needsRefresh}
              required
              minLength={10}
              maxLength={1000}
              rows={6}
              placeholder="Describe the verified findings, remaining uncertainty and recommended next review action."
              onChange={event => {
                setNote(event.target.value);
                setConfirmed(false);
              }}
            />
          </Field>

          <p className="text-right text-xs text-slate-500">
            {note.length}/1000 characters
          </p>

          <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />

            <p>
              Findings are encrypted in storage. Returning
              this request to the reviewer does not confirm
              the address or change the approved dataset.
            </p>
          </div>

          <label className="flex items-start gap-3 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={confirmed}
              disabled={saving || needsRefresh}
              onChange={event =>
                setConfirmed(event.target.checked)
              }
              className="mt-1 h-4 w-4 accent-emerald-700"
            />

            <span>
              I have reviewed these findings and understand
              that a new reviewer decision and merchant
              confirmation are required.
            </span>
          </label>

          <Notice message={error} />

          <div className="flex flex-wrap justify-end gap-3">
            <button
              type="button"
              className={secondaryClass}
              disabled={saving}
              onClick={refresh}
            >
              <RefreshCw className="h-4 w-4" />
              Refresh investigation
            </button>

            <button
              type="button"
              className={secondaryClass}
              disabled={saving}
              onClick={onClose}
            >
              Cancel
            </button>

            <button
              type="submit"
              className={primaryClass}
              disabled={
                saving ||
                needsRefresh ||
                !confirmed ||
                note.trim().length < 10
              }
            >
              <Send className="h-4 w-4" />

              {saving
                ? "Returning to reviewer..."
                : "Return to reviewer"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
