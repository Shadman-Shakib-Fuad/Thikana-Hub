"use client";

import {
  useId,
  useRef,
  useState,
} from "react";

import {
  CheckCircle2,
  MessageSquare,
  Clock,
  AlertCircle,
  Loader2,
  MapPin,
} from "lucide-react";

import { useAuth } from "@/context/AuthContext";
import { ApiError } from "@/services/api";
import { addressService } from "@/services/address.service";

import type {
  AddressCandidate,
  AddressDecision,
  AddressStatus,
  AddressFeedbackData,
  AddressFeedbackResponse,
} from "@/types/address";

interface AddressFeedbackProps {
  jobId: string;
  candidates: AddressCandidate[];
  status: AddressStatus;
  decision?: AddressDecision | null;
  selectedCandidate?: AddressCandidate | null;

  onUpdated: (
    response: AddressFeedbackResponse
  ) => void;
}

export default function AddressFeedback({
  jobId,
  candidates,
  status,
  decision,
  selectedCandidate,
  onUpdated,
}: AddressFeedbackProps) {
  const { refreshUser } = useAuth();

  const selectionId = useId();

  const [selectedId, setSelectedId] =
    useState("");

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState("");

  const [conflict, setConflict] =
    useState(false);

  const pending = useRef(false);

  async function submit(
    choice: "confirmed" | "no_correct_match"
  ) {
    if (pending.current || decision || conflict) {
      return;
    }

    if (choice === "confirmed" && !selectedId) {
      setError("Please select a locality first.");
      return;
    }

    const accepted = window.confirm(
      choice === "confirmed"
        ? "Confirm this locality? This decision cannot currently be changed."
        : "Request manual review? This decision cannot currently be changed."
    );

    if (!accepted) return;

    setError("");
    pending.current = true;
    setLoading(true);

    const payload: AddressFeedbackData =
      choice === "confirmed"
        ? {
            jobId,
            decision: "confirmed",
            localityId: selectedId,
          }
        : {
            jobId,
            decision: "no_correct_match",
          };

    try {
      const response =
        await addressService.submitFeedback(payload);

      onUpdated(response);

    } catch (error) {
      if (error instanceof ApiError) {
        if (error.status === 401) {
          setError(
            "Your session has expired. Please sign in again."
          );

          await refreshUser();

        } else if (error.status === 409) {
          setConflict(true);

          setError(
            "This request may already be updated. Reopen it from Search History to check its latest status."
          );

        } else {
          setError(error.message);
        }

      } else {
        setError(
          "Unable to submit feedback. Please check Search History before retrying."
        );
      }

    } finally {
      pending.current = false;
      setLoading(false);
    }
  }

  // Confirmed address
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

            <p className="mt-2 text-sm leading-relaxed text-emerald-800">
              Your selected locality has been saved
              securely. This is a merchant confirmation,
              not an independently verified delivery address.
            </p>
          </div>
        </div>
      </section>
    );
  }

  // Manual review requested
  if (decision === "review_requested") {
    return (
      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <Clock
            size={28}
            className="shrink-0 text-amber-700"
          />

          <div>
            <h3 className="font-bold text-amber-900">
              Manual Review Requested
            </h3>

            <p className="mt-2 text-sm leading-relaxed text-amber-800">
              Your feedback has been recorded.
              Reviewer assignment and manual verification
              will be available in a future update.
            </p>
          </div>
        </div>
      </section>
    );
  }

  // Feedback form
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">

      <div className="mb-5 flex items-center gap-3">
        <div className="rounded-xl bg-emerald-50 p-3 text-emerald-700">
          <MessageSquare size={23} />
        </div>

        <div>
          <h3 className="font-bold text-slate-900">
            Review Matching Results
          </h3>

          <p className="text-sm text-slate-500">
            Confirm a locality or request manual review.
          </p>
        </div>
      </div>

      {candidates.length > 0 && (
        <div>
          <label
            htmlFor={selectionId}
            className="mb-2 block text-sm font-semibold text-slate-700"
          >
            Select a suggested locality
          </label>

          <div className="flex items-center gap-3 rounded-xl border border-slate-300 bg-slate-50 px-3">
            <MapPin
              size={19}
              className="shrink-0 text-emerald-600"
            />

            <select
              id={selectionId}
              value={selectedId}
              onChange={(event) =>
                setSelectedId(event.target.value)
              }
              disabled={loading || conflict}
              className="min-w-0 flex-1 bg-transparent py-3 text-sm text-slate-800 outline-none"
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
                  {candidate.score}/100
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="mt-4 flex items-start gap-2 rounded-xl bg-red-50 p-4 text-sm text-red-700"
        >
          <AlertCircle
            size={19}
            className="shrink-0"
          />
          {error}
        </div>
      )}

      <div className="mt-5 flex flex-wrap gap-3">

        {candidates.length > 0 && (
          <button
            type="button"
            disabled={
              loading || conflict || !selectedId
            }
            onClick={() => void submit("confirmed")}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
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
            void submit("no_correct_match")
          }
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-5 py-3 text-sm font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-50"
        >
          <MessageSquare size={18} />
          No Correct Match
        </button>
      </div>

      <p className="mt-4 text-xs leading-relaxed text-slate-500">
        Please review the area and district carefully.
        Your decision is stored with the encrypted
        address request.
      </p>
    </section>
  );
}