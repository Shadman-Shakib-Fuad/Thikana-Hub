"use client";

import {
  useId,
  useRef,
  useState,
} from "react";

import {
  CheckCircle2,
  Clock,
  AlertCircle,
  Loader2,
  Bookmark,
  BookmarkCheck,
  MessageSquare,
} from "lucide-react";

import { useAuth } from "@/context/AuthContext";
import { ApiError } from "@/services/api";
import { addressService } from "@/services/address.service";

import type {
  AddressCandidate,
  AddressDecision,
  AddressStatus,
  AddressFeedbackResponse,
  SaveAddressResponse,
} from "@/types/address";

interface AddressFeedbackProps {
  jobId: string;
  candidates: AddressCandidate[];
  status: AddressStatus;

  decision?: AddressDecision | null;

  selectedCandidate?: AddressCandidate | null;

  revision?: number;
  saved?: boolean;

  onUpdated: (
    response: AddressFeedbackResponse
  ) => void;

  onSaved?: (
    response: SaveAddressResponse
  ) => void;

  onBusyChange?: (
    busy: boolean
  ) => void;

  onConflict?: () => void;
}

export default function AddressFeedback({
  jobId,
  candidates,
  status,
  decision,
  selectedCandidate,
  revision = 0,
  saved,
  onUpdated,
  onSaved,
  onBusyChange,
  onConflict,
}: AddressFeedbackProps) {
  const { refreshUser } = useAuth();

  const selectionId = useId();

  const [selectedId, setSelectedId] = useState("");

  const [localSaved, setLocalSaved] = useState(false);

  const [loading, setLoading] = useState(false);

  const [error, setError] = useState("");

  const [conflict, setConflict] = useState(false);

  const pending = useRef(false);

  const isSaved = saved ?? localSaved;

  async function perform(
    action: () => Promise<void>
  ) {
    if (pending.current || conflict) return;

    pending.current = true;

    setLoading(true);
    setError("");

    onBusyChange?.(true);

    try {
      await action();

    } catch (error) {
      if (
        error instanceof ApiError &&
        error.status === 401
      ) {
        setError("Your session has expired.");

        await refreshUser();

      } else if (
        error instanceof ApiError &&
        [0, 404, 409].includes(error.status)
      ) {
        setConflict(true);

        setError(
          "Unable to complete this action safely. Refresh the address details before retrying."
        );

        onConflict?.();

      } else {
        setError(
          error instanceof Error
            ? error.message
            : "Unable to complete the request."
        );
      }

    } finally {
      pending.current = false;

      setLoading(false);

      onBusyChange?.(false);
    }
  }

  async function submitFeedback(
    choice: "confirmed" | "no_correct_match"
  ) {
    if (
      pending.current ||
      decision ||
      status === "confirmed" ||
      conflict
    ) {
      return;
    }

    if (
      choice === "confirmed" &&
      !selectedId
    ) {
      setError("Please select a locality first.");
      return;
    }

    const accepted = window.confirm(
      choice === "confirmed"
        ? "Confirm the selected locality?"
        : "Request manual review? Editing will be locked."
    );

    if (!accepted) return;

    await perform(async () => {
      const response = await addressService.submitFeedback(
        choice === "confirmed"
          ? {
              jobId,
              revision,
              decision: "confirmed",
              localityId: selectedId,
            }
          : {
              jobId,
              revision,
              decision: "no_correct_match",
            }
      );

      onUpdated(response);
    });
  }

  async function toggleBookmark() {
    if (status !== "confirmed") return;

    await perform(async () => {
      const response = await addressService.saveAddress(
        jobId,
        {
          saved: !isSaved,
          revision,
        }
      );

      setLocalSaved(response.saved);

      onSaved?.(response);
    });
  }

  const errorMessage = error ? (
    <div
      role="alert"
      className="mt-4 flex items-start gap-2 rounded-xl bg-red-50 p-4 text-sm text-red-700"
    >
      <AlertCircle size={18} className="shrink-0" />

      <div>
        {error}

        {conflict && !onConflict && (
          <p className="mt-2">
            Open this address from Search History
            to retrieve the latest information.
          </p>
        )}
      </div>
    </div>
  ) : null;

  // Confirmed address and bookmark controls
  if (
    decision === "confirmed" ||
    status === "confirmed"
  ) {
    return (
      <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 sm:p-6">

        <div className="flex items-start gap-3">
          <CheckCircle2
            size={28}
            className="shrink-0 text-emerald-700"
          />

          <div>
            <h3 className="font-bold text-emerald-900">
              Locality Confirmed
            </h3>

            {selectedCandidate && (
              <p className="mt-2 font-semibold text-emerald-800">
                {selectedCandidate.locality.nameEn}
                {" — "}
                {selectedCandidate.locality.nameBn}
              </p>
            )}

            <p className="mt-2 text-sm text-emerald-800">
              Merchant confirmation does not independently
              verify a physical delivery address.
            </p>
          </div>
        </div>

        {errorMessage}

        <button
          type="button"
          disabled={loading || conflict}
          aria-pressed={isSaved}
          onClick={() => void toggleBookmark()}
          className={`mt-5 inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold disabled:opacity-50 ${
            isSaved
              ? "border border-emerald-300 bg-white text-emerald-700 hover:bg-emerald-100"
              : "bg-emerald-700 text-white hover:bg-emerald-800"
          }`}
        >
          {loading ? (
            <Loader2 size={18} className="animate-spin" />
          ) : isSaved ? (
            <BookmarkCheck size={18} />
          ) : (
            <Bookmark size={18} />
          )}

          {isSaved
            ? "Saved — Unsave Address"
            : "Save Address"}
        </button>

        <p className="mt-3 text-xs text-emerald-800">
          {isSaved
            ? "This address is in your Saved Addresses."
            : "Bookmark this address for future use."}
        </p>
      </section>
    );
  }

  // Manual review
  if (decision === "review_requested") {
    return (
      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5">

        <div className="flex items-start gap-3">
          <Clock size={26} className="shrink-0 text-amber-700" />

          <div>
            <h3 className="font-bold text-amber-900">
              Manual Review Requested
            </h3>

            <p className="mt-2 text-sm text-amber-800">
              Your feedback has been recorded.
              Editing and deletion are currently locked.
              Reviewer assignment is not available yet.
            </p>
          </div>
        </div>
      </section>
    );
  }

  // Pending address feedback
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">

      <h3 className="font-bold text-slate-900">
        Review Matching Results
      </h3>

      <p className="mt-2 text-sm text-slate-500">
        Confirm a locality or request manual review.
      </p>

      {candidates.length > 0 && (
        <div className="mt-5">
          <label
            htmlFor={selectionId}
            className="mb-2 block text-sm font-semibold text-slate-700"
          >
            Select a suggested locality
          </label>

          <select
            id={selectionId}
            value={selectedId}
            disabled={loading || conflict}
            onChange={(e) => setSelectedId(e.target.value)}
            className="w-full rounded-xl border border-slate-300 bg-slate-50 p-3 text-sm text-slate-800"
          >
            <option value="">Choose a locality</option>

            {candidates.map((candidate) => (
              <option
                key={candidate.localityId}
                value={candidate.localityId}
              >
                {candidate.locality.nameEn}
                {" — "}
                {candidate.locality.areaEn}
                {" — "}
                {candidate.locality.districtEn}
                {" — "}
                {candidate.score}/100
              </option>
            ))}
          </select>
        </div>
      )}

      {errorMessage}

      <div className="mt-5 flex flex-wrap gap-3">

        {candidates.length > 0 && (
          <button
            type="button"
            disabled={loading || conflict || !selectedId}
            onClick={() => void submitFeedback("confirmed")}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
          >
            {loading ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <CheckCircle2 size={18} />
            )}

            Confirm Locality
          </button>
        )}

        <button
          type="button"
          disabled={loading || conflict}
          onClick={() => void submitFeedback("no_correct_match")}
          className="inline-flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-5 py-3 text-sm font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-50"
        >
          <MessageSquare size={18} />

          No Correct Match
        </button>
      </div>

      <p className="mt-4 text-xs text-slate-500">
        Review the area and district carefully before confirming.
      </p>
    </section>
  );
}