"use client";

import { useRef, useState, type FormEvent } from "react";
import { Plus, Minus, X } from "lucide-react";

import { apiRequest } from "@/services/api";

import {
  TERM_FIELDS,
  type TermField,
  type ItemResponse,
  type LocalityRecord,
  type LocalityTermsResponse,
  type ProposalRecord,
} from "@/types/data-manager-management";

import {
  BASE,
  Field,
  Notice,
  Loading,
  useRemote,
  errorMessage,
  inputClass,
  primaryClass,
  secondaryClass,
  panelClass,
} from "./ManagementShared";

export default function TermProposalForm({
  selected,
  onClose,
  onSuccess,
}: {
  selected: LocalityRecord;
  onClose: () => void;
  onSuccess: (proposalId: string) => void;
}) {
  const [revision, setRevision] = useState(0);

  const remote = useRemote<LocalityTermsResponse>(
    `${BASE}/localities/${encodeURIComponent(selected.localityId)}/terms`,
    revision
  );

  const [field, setField] =
    useState<TermField>("aliases");

  const [operation, setOperation] =
    useState<"add" | "remove">("add");

  const [term, setTerm] = useState("");
  const [reason, setReason] = useState("");
  const [evidence, setEvidence] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const inFlight = useRef(false);

  const currentField = remote.data?.fields.find(
    item => item.field === field
  );

  function changeField(value: TermField) {
    setField(value);
    setTerm("");
    setError("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (inFlight.current) return;

    setError("");

    if (!currentField?.supported) {
      setError("This dataset field is not supported.");
      return;
    }

    if (
      term.trim().length < 1 ||
      term.trim().length > 120 ||
      !/[\p{L}\p{N}]/u.test(term)
    ) {
      setError("Enter a valid alias or landmark.");
      return;
    }

    if (
      operation === "remove" &&
      !currentField.items.includes(term)
    ) {
      setError("Select an existing term to remove.");
      return;
    }

    if (
      reason.trim().length < 10 ||
      evidence.trim().length < 5
    ) {
      setError("Provide a meaningful reason and supporting evidence.");
      return;
    }

    inFlight.current = true;
    setSaving(true);

    try {
      const latest = await apiRequest<LocalityTermsResponse>(
        `${BASE}/localities/${encodeURIComponent(selected.localityId)}/terms`
      );

      const latestField = latest.fields.find(
        item => item.field === field
      );

      if (
        !latestField?.supported ||
        JSON.stringify(latestField.items) !==
          JSON.stringify(currentField.items)
      ) {
        setRevision(previous => previous + 1);
        setTerm("");

        throw new Error(
          "The term list changed. Review the latest terms and submit again."
        );
      }

      const result = await apiRequest<
        ItemResponse<ProposalRecord>
      >(`${BASE}/term-proposals`, {
        method: "POST",

        body: {
          localityId: selected.localityId,
          field,
          operation,
          term: term.trim(),
          reason: reason.trim(),
          evidence: evidence.trim(),
        },
      });

      onSuccess(result.item.proposalId);

    } catch (err) {
      setError(errorMessage(err));

    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }

  return (
    <section className={panelClass}>
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">
            Landmark & alias proposal
          </h2>

          <p className="mt-2 text-sm text-slate-500">
            {selected.locality.nameEn} · {selected.locality.nameBn}
          </p>

          <p className="mt-1 text-xs text-slate-400">
            {selected.localityId}
          </p>
        </div>

        <button
          type="button"
          aria-label="Close term form"
          disabled={saving}
          onClick={onClose}
          className="rounded-lg p-2 hover:bg-slate-100 disabled:opacity-50"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {remote.loading ? (
        <Loading />
      ) : remote.error ? (
        <div className="space-y-3">
          <Notice message={remote.error} />

          <button
            type="button"
            className={secondaryClass}
            onClick={() => setRevision(value => value + 1)}
          >
            Retry
          </button>
        </div>
      ) : remote.data ? (
        <form onSubmit={submit} className="space-y-5">
          <Notice message={error} />

          <Field label="Dataset field">
            <select
              className={inputClass}
              value={field}
              disabled={saving}
              onChange={event =>
                changeField(event.target.value as TermField)
              }
            >
              {TERM_FIELDS.map(([value, label]) => (
                <option
                  key={value}
                  value={value}
                  disabled={!remote.data?.fields.find(
                    item => item.field === value
                  )?.supported}
                >
                  {label}
                </option>
              ))}
            </select>
          </Field>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <h3 className="text-sm font-semibold">
              Current approved terms
            </h3>

            <div className="mt-3 flex flex-wrap gap-2">
              {currentField?.items.length ? (
                currentField.items.map((item, index) => (
                  <span
                    key={`${item}-${index}`}
                    className="max-w-full break-words rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700"
                  >
                    {item}
                  </span>
                ))
              ) : (
                <span className="text-sm text-slate-500">
                  No terms available.
                </span>
              )}
            </div>
          </div>

          <Field label="Operation">
            <select
              className={inputClass}
              value={operation}
              disabled={saving}
              onChange={event => {
                setOperation(
                  event.target.value as "add" | "remove"
                );
                setTerm("");
                setError("");
              }}
            >
              <option value="add">Add new term</option>
              <option value="remove">Remove existing term</option>
            </select>
          </Field>

          <Field label={operation === "add" ? "New term" : "Existing term"}>
            {operation === "add" ? (
              <input
                className={inputClass}
                value={term}
                required
                maxLength={120}
                disabled={saving}
                placeholder="Bangla or English alias / landmark"
                onChange={event => setTerm(event.target.value)}
              />
            ) : (
              <select
                className={inputClass}
                value={term}
                required
                disabled={saving}
                onChange={event => setTerm(event.target.value)}
              >
                <option value="">Select an existing term</option>

                {currentField?.items.map((item, index) => (
                  <option key={`${item}-${index}`} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            )}
          </Field>

          <Field label="Reason">
            <textarea
              className={inputClass}
              value={reason}
              required
              disabled={saving}
              minLength={10}
              maxLength={1000}
              rows={3}
              onChange={event => setReason(event.target.value)}
            />
          </Field>

          <Field label="Supporting evidence">
            <textarea
              className={inputClass}
              value={evidence}
              required
              disabled={saving}
              minLength={5}
              maxLength={500}
              rows={3}
              placeholder="Official source or verifiable reference. Do not include private information."
              onChange={event => setEvidence(event.target.value)}
            />
          </Field>

          <div className="flex flex-wrap justify-end gap-3">
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
                !currentField?.supported ||
                (operation === "remove" &&
                  !currentField.items.length)
              }
            >
              {operation === "add"
                ? <Plus className="h-4 w-4" />
                : <Minus className="h-4 w-4" />}

              {saving ? "Submitting..." : "Submit proposal"}
            </button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
