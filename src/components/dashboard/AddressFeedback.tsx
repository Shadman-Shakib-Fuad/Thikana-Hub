"use client";

import Link from "next/link";

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
  UserCheck,
  ArrowRight,
} from "lucide-react";

import { useAuth } from "@/context/AuthContext";

import { ApiError } from "@/services/api";

import { addressService } from "@/services/address.service";

import {
  isManualReviewCandidate,
} from "@/types/address";

import type {
  AddressCandidate,
  SelectedAddressCandidate,
  AddressDecision,
  AddressStatus,
  AddressFeedbackResponse,
  SaveAddressResponse,
} from "@/types/address";

// =====================================
// COMPONENT PROPS
// =====================================

interface AddressFeedbackProps {
  jobId: string;

  candidates: AddressCandidate[];

  status: AddressStatus;

  decision?: AddressDecision | null;

  selectedCandidate?: SelectedAddressCandidate | null;

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

// =====================================
// BUTTON STYLES
// =====================================

const primaryButton =
  "inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50";

const secondaryButton =
  "inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-300 bg-white px-5 py-3 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50";

// =====================================
// MAIN COMPONENT
// =====================================

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

  const [selectedId, setSelectedId] =
    useState("");

  const [localSaved, setLocalSaved] =
    useState(false);

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState("");

  const [conflict, setConflict] =
    useState(false);

  const pending = useRef(false);

  const isSaved = saved ?? localSaved;

  const manualReview =
    isManualReviewCandidate(selectedCandidate);

  const isConfirmed =
    decision === "confirmed" ||
    status === "confirmed";

  // =================================
  // SAFE API MUTATION HANDLER
  // =================================

  async function perform(
    action: () => Promise<void>
  ) {
    if (
      pending.current ||
      conflict
    ) {
      return;
    }

    pending.current = true;

    setLoading(true);
    setError("");

    onBusyChange?.(true);

    try {
      await action();

    } catch (error: unknown) {
      if (
        error instanceof ApiError &&
        error.status === 401
      ) {
        setConflict(true);

        setError(
          "Your session has expired."
        );

        await refreshUser();

      } else if (
        error instanceof ApiError &&
        (
          [0, 403, 404, 409].includes(error.status) ||
          error.status >= 500 ||
          error.code === "INVALID_RESPONSE"
        )
      ) {
        // The server may have already committed
        // the operation before a response failed.
        // Require a fresh snapshot before retrying.

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

  // =================================
  // SUBMIT MERCHANT FEEDBACK
  // =================================

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

    if (choice === "confirmed") {
      const validCandidate = candidates.some(
        (candidate) =>
          candidate.localityId === selectedId
      );

      if (!selectedId || !validCandidate) {
        setError(
          "Please select a valid locality first."
        );

        return;
      }
    }

    const accepted = window.confirm(
      choice === "confirmed"
        ? "Confirm the selected locality?"
        : "Request manual review? Editing and deletion will be locked while the review is active."
    );

    if (!accepted) return;

    await perform(async () => {
      const response =
        await addressService.submitFeedback(
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

  // =================================
  // SAVE OR UNSAVE ADDRESS
  // =================================

  async function toggleBookmark() {
    if (
      status !== "confirmed" ||
      pending.current ||
      conflict
    ) {
      return;
    }

    await perform(async () => {
      const response =
        await addressService.saveAddress(
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

  // =================================
  // ERROR MESSAGE
  // =================================

  const errorMessage = error ? (
    <div
      role="alert"
      className="mt-4 flex items-start gap-2 rounded-xl bg-red-50 p-4 text-sm text-red-700"
    >
      <AlertCircle
        size={18}
        className="shrink-0"
      />

      <div>
        <p>{error}</p>

        {conflict && !onConflict && (
          <p className="mt-2">
            Open this address from Search History
            to retrieve the latest information.
          </p>
        )}
      </div>

    </div>
  ) : null;

  // =================================
  // CONFIRMED ADDRESS
  // =================================

  if (isConfirmed) {
    return (
      <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 sm:p-6">

        <div className="flex items-start gap-3">

          <CheckCircle2
            size={28}
            className="shrink-0 text-emerald-700"
          />

          <div className="min-w-0">

            <h3 className="font-bold text-emerald-900">
              Locality Confirmed
            </h3>

            {selectedCandidate && (
              <p className="mt-2 break-words font-semibold text-emerald-800">
                {selectedCandidate.locality.nameEn}
                {" — "}
                {selectedCandidate.locality.nameBn}
              </p>
            )}

            {manualReview ? (
              <div className="mt-3 space-y-2">

                <span className="inline-flex items-center gap-2 rounded-full bg-blue-100 px-3 py-1.5 text-xs font-semibold text-blue-800">

                  <UserCheck size={16} />

                  Human Reviewed

                </span>

                <p className="text-xs leading-relaxed text-emerald-800">
                  This locality was recommended through
                  manual review and accepted by the merchant.
                  No algorithm-generated score is assigned.
                </p>

              </div>
            ) : (
              selectedCandidate && (
                <p className="mt-3 text-xs font-medium text-emerald-800">
                  Matching Engine Recommendation
                </p>
              )
            )}

            <p className="mt-3 text-sm leading-relaxed text-emerald-800">
              Merchant confirmation does not independently
              verify a physical delivery address.
            </p>

          </div>

        </div>

        {errorMessage}

        {/* =================================
            BOOKMARK CONTROLS
        ================================= */}

        <div className="mt-5 flex flex-wrap gap-3">

          <button
            type="button"
            disabled={loading || conflict}
            aria-pressed={isSaved}
            onClick={() =>
              void toggleBookmark()
            }
            className={
              isSaved
                ? secondaryButton
                : primaryButton
            }
          >

            {loading ? (

              <Loader2
                size={18}
                className="animate-spin"
              />

            ) : isSaved ? (

              <BookmarkCheck size={18} />

            ) : (

              <Bookmark size={18} />

            )}

            {isSaved
              ? "Saved — Unsave Address"
              : "Save Address"}

          </button>

          {manualReview && !loading && (
            <Link
              href="/dashboard/reviews/"
              className={secondaryButton}
            >

              <UserCheck size={18} />

              View Manual Reviews

            </Link>
          )}

        </div>

        <p className="mt-3 text-xs text-emerald-800">

          {isSaved
            ? "This address is in your Saved Addresses."
            : "Bookmark this address for future use."}

        </p>

      </section>
    );
  }

  // =================================
  // MANUAL REVIEW REQUESTED
  // =================================

  if (decision === "review_requested") {
    return (
      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 sm:p-6">

        <div className="flex items-start gap-3">

          <Clock
            size={26}
            className="shrink-0 text-amber-700"
          />

          <div className="min-w-0">

            <h3 className="font-bold text-amber-900">
              Manual Review Requested
            </h3>

            <p className="mt-2 text-sm leading-relaxed text-amber-800">
              Your review request has been recorded.
              You can track its current status from
              the Manual Reviews workspace.
            </p>

            <p className="mt-3 text-xs leading-relaxed text-amber-800">
              Editing and deletion are currently locked
              while the review request remains active.
            </p>

          </div>

        </div>

        {errorMessage}

        <Link
          href="/dashboard/reviews/"
          className="mt-5 inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-800"
        >

          <UserCheck size={18} />

          Track Manual Review

          <ArrowRight size={17} />

        </Link>

        <p className="mt-3 text-xs leading-relaxed text-amber-800">
          When a reviewer recommendation becomes available,
          you can inspect the result, accept the recommended
          locality or request another review.
        </p>

      </section>
    );
  }

  // =================================
  // PENDING ADDRESS FEEDBACK
  // =================================

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">

      <h3 className="font-bold text-slate-900">
        Review Matching Results
      </h3>

      <p className="mt-2 text-sm text-slate-500">
        Confirm a locality or request manual review.
      </p>

      {/* =================================
          CANDIDATE SELECTOR
      ================================= */}

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
            onChange={(event) =>
              setSelectedId(event.target.value)
            }
            className="w-full rounded-xl border border-slate-300 bg-slate-50 p-3 text-sm text-slate-800"
          >

            <option value="">
              Choose a locality
            </option>

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

      {/* =================================
          FEEDBACK ACTIONS
      ================================= */}

      <div className="mt-5 flex flex-wrap gap-3">

        {candidates.length > 0 && (
          <button
            type="button"
            disabled={
              loading ||
              conflict ||
              !selectedId
            }
            onClick={() =>
              void submitFeedback("confirmed")
            }
            className={primaryButton}
          >

            {loading ? (

              <Loader2
                size={18}
                className="animate-spin"
              />

            ) : (

              <CheckCircle2 size={18} />

            )}

            Confirm Locality

          </button>
        )}

        <button
          type="button"
          disabled={loading || conflict}
          onClick={() =>
            void submitFeedback("no_correct_match")
          }
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-5 py-3 text-sm font-semibold text-amber-800 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
        >

          <MessageSquare size={18} />

          No Correct Match

        </button>

      </div>

      <p className="mt-4 text-xs leading-relaxed text-slate-500">
        Review the area and district carefully before
        confirming. Request manual review if none of
        the suggested localities are appropriate.
      </p>

    </section>
  );
}