"use client";

import { useRef, useState, type FormEvent } from "react";
import { Save, X } from "lucide-react";

import { apiRequest } from "@/services/api";

import {
  NAME_FIELDS,
  type LocalityNames,
  type LocalityRecord,
  type ItemResponse,
  type PageResponse,
  type ProposalRecord,
} from "@/types/data-manager-management";

import {
  BASE,
  Field,
  Notice,
  inputClass,
  panelClass,
  primaryClass,
  secondaryClass,
  errorMessage,
} from "./ManagementShared";

function emptyNames(): LocalityNames {
  return Object.fromEntries(
    NAME_FIELDS.map(([key]) => [key, ""])
  ) as LocalityNames;
}

export default function LocalityProposalForm({
  selected,
  onClose,
  onSuccess,
}: {
  selected: LocalityRecord | null;
  onClose: () => void;
  onSuccess: (proposalId: string) => void;
}) {
  const operation = selected ? "update" : "create";

  const [localityId, setLocalityId] = useState(
    selected?.localityId ?? ""
  );

  const [names, setNames] = useState<LocalityNames>(
    selected ? { ...selected.locality } : emptyNames()
  );

  const [reason, setReason] = useState("");
  const [evidence, setEvidence] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const inFlight = useRef(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (inFlight.current) return;

    setError("");

    const id = localityId.trim().toUpperCase();

    const locality = Object.fromEntries(
      NAME_FIELDS.map(([key]) => [
        key,
        names[key].trim(),
      ])
    ) as LocalityNames;

    if (!/^[A-Z0-9-]{4,128}$/.test(id)) {
      setError("Enter a valid locality ID using letters, numbers and hyphens.");
      return;
    }

    if (Object.values(locality).some(
      value => !value || value.length > 120
    )) {
      setError("Complete all eight locality name fields.");
      return;
    }

    if (
      reason.trim().length < 10 ||
      evidence.trim().length < 5
    ) {
      setError("Provide a meaningful reason and supporting evidence.");
      return;
    }

    if (
      selected &&
      NAME_FIELDS.every(
        ([key]) => locality[key] === selected.locality[key]
      )
    ) {
      setError("Change at least one locality field before submitting.");
      return;
    }

    inFlight.current = true;
    setSaving(true);

    try {
      // Detect changes since the editing form was opened.
      // Final approval remains protected by the backend.

      if (selected) {
        const query = new URLSearchParams({
          q: selected.localityId,
          approved: "true",
          limit: "50",
        });

        const result = await apiRequest<
          PageResponse<LocalityRecord>
        >(`${BASE}/localities?${query}`);

        const current = result.items.find(
          item => item.localityId === selected.localityId
        );

        if (
          !current ||
          current.updatedAt !== selected.updatedAt ||
          NAME_FIELDS.some(
            ([key]) =>
              current.locality[key] !== selected.locality[key]
          )
        ) {
          throw new Error(
            "The locality changed. Close this form and select the latest record."
          );
        }
      }

      const result = await apiRequest<
        ItemResponse<ProposalRecord>
      >(`${BASE}/locality-proposals`, {
        method: "POST",

        body: {
          operation,
          localityId: id,
          locality,
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
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">
            {selected
              ? "Update locality proposal"
              : "New locality proposal"}
          </h2>

          <p className="mt-1 text-sm text-slate-500">
            Changes remain pending until approved by an administrator.
          </p>
        </div>

        <button
          type="button"
          aria-label="Close locality form"
          disabled={saving}
          onClick={onClose}
          className="rounded-lg p-2 hover:bg-slate-100 disabled:opacity-50"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <form onSubmit={submit} className="space-y-5">
        <Notice message={error} />

        <Field label="Locality ID">
          <input
            className={inputClass}
            value={localityId}
            readOnly={Boolean(selected)}
            disabled={saving}
            minLength={4}
            maxLength={128}
            placeholder="BD-DHA-LOCALITY"
            required
            onChange={event =>
              setLocalityId(event.target.value.toUpperCase())
            }
          />
        </Field>

        <div className="grid gap-4 md:grid-cols-2">
          {NAME_FIELDS.map(([key, label]) => (
            <Field key={key} label={label}>
              <input
                className={inputClass}
                value={names[key]}
                disabled={saving}
                required
                maxLength={120}
                lang={key.endsWith("Bn") ? "bn" : "en"}
                onChange={event =>
                  setNames(previous => ({
                    ...previous,
                    [key]: event.target.value,
                  }))
                }
              />
            </Field>
          ))}
        </div>

        <Field label="Reason for change">
          <textarea
            className={inputClass}
            value={reason}
            required
            disabled={saving}
            minLength={10}
            maxLength={1000}
            rows={3}
            placeholder="Explain why this change is necessary."
            onChange={event => setReason(event.target.value)}
          />
        </Field>

        <Field label="Supporting evidence">
          <textarea
            className={inputClass}
            value={evidence}
            disabled={saving}
            required
            minLength={5}
            maxLength={500}
            rows={3}
            placeholder="Official source URL or verifiable reference."
            onChange={event => setEvidence(event.target.value)}
          />
        </Field>

        <p className="rounded-xl bg-amber-50 p-3 text-xs leading-relaxed text-amber-800">
          Do not include customer addresses, passwords or other
          sensitive personal information in proposal evidence.
        </p>

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
            disabled={saving}
          >
            <Save className="h-4 w-4" />
            {saving ? "Submitting..." : "Submit proposal"}
          </button>
        </div>
      </form>
    </section>
  );
}
