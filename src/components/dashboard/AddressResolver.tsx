"use client";

import {
  useRef,
  useState,
  type FormEvent,
} from "react";

import {
  ScanSearch,
  MapPin,
  Languages,
  ShieldCheck,
  Loader2,
  AlertCircle,
  CheckCircle2,
  SearchX,
  RotateCcw,
  Sparkles,
} from "lucide-react";

import { useAuth } from "@/context/AuthContext";

import { ApiError } from "@/services/api";

import {
  addressService,
} from "@/services/address.service";

import type {
  AddressCandidate,
  AddressResolutionResponse,
} from "@/types/address";

const MAX_LENGTH = 300;

// Synthetic examples for starter dataset
const EXAMPLES = [
  "বাসা ১২, Kazipra, মিরপুর, Dhaka",
  "শেওড়াপাড়া, মিরপুর, ঢাকা",
  "Mirpur-10, Dhaka",
];

const MATCH_LABELS = {
  exact: "Exact match",
  fuzzy: "Spelling similarity",
  landmark: "Landmark match",
};

// =====================================
// CANDIDATE RESULT CARD
// =====================================

function CandidateCard({
  candidate,
  index,
}: {
  candidate: AddressCandidate;
  index: number;
}) {
  const { locality } = candidate;

  const score = Math.max(
    0,
    Math.min(100, candidate.score)
  );

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">

      {/* Candidate Header */}
      <div className="flex flex-wrap items-start gap-4">

        <div className="rounded-xl bg-emerald-50 p-3 text-emerald-700">
          <MapPin size={26} />
        </div>

        <div className="min-w-0 flex-1">

          <div className="mb-2 flex flex-wrap gap-2">
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
              Rank #{index + 1}
            </span>

            <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
              {MATCH_LABELS[candidate.matchType]}
            </span>
          </div>

          <h3 className="break-words text-xl font-bold text-slate-900">
            {locality.nameEn}
          </h3>

          <p className="mt-1 text-sm font-medium text-slate-600">
            {locality.nameBn}
          </p>

          <p className="mt-1 text-sm text-slate-500">
            {[
              locality.areaEn,
              locality.districtEn,
              "Bangladesh",
            ].filter(Boolean).join(", ")}
          </p>
        </div>

        {/* Score */}
        <div className="text-right">
          <p className="text-3xl font-bold text-emerald-700">
            {score}
            <span className="text-sm text-slate-400">
              /100
            </span>
          </p>

          <p className="text-xs text-slate-500">
            Ranking Score
          </p>
        </div>
      </div>

      {/* Score Progress Bar */}
      <div
        role="progressbar"
        aria-label="Locality ranking score"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={score}
        className="mt-5 h-2.5 overflow-hidden rounded-full bg-slate-100"
      >
        <div
          className="h-full rounded-full bg-emerald-600 transition-all duration-500"
          style={{ width: `${score}%` }}
        />
      </div>

      {/* Locality Information */}
      <div className="mt-5 grid gap-3 sm:grid-cols-3">

        <div className="rounded-xl bg-slate-50 p-3">
          <p className="text-xs text-slate-500">
            Area
          </p>

          <p className="mt-1 break-words text-sm font-semibold text-slate-800">
            {locality.areaEn || "Not available"}
          </p>
        </div>

        <div className="rounded-xl bg-slate-50 p-3">
          <p className="text-xs text-slate-500">
            District
          </p>

          <p className="mt-1 break-words text-sm font-semibold text-slate-800">
            {locality.districtEn || "Not available"}
          </p>
        </div>

        <div className="rounded-xl bg-slate-50 p-3">
          <p className="text-xs text-slate-500">
            Division
          </p>

          <p className="mt-1 break-words text-sm font-semibold text-slate-800">
            {locality.divisionEn || "Not available"}
          </p>
        </div>
      </div>

      {/* Matching Reasons */}
      <div className="mt-5">
        <h4 className="mb-3 text-sm font-bold text-slate-700">
          Why this location matched
        </h4>

        <div className="flex flex-wrap gap-2">
          {candidate.reasons.map((reason, i) => {
            const warning =
              reason.toLowerCase().includes("different");

            return (
              <span
                key={`${reason}-${i}`}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium ${
                  warning
                    ? "bg-amber-50 text-amber-700"
                    : "bg-emerald-50 text-emerald-700"
                }`}
              >
                {warning ? (
                  <AlertCircle size={14} />
                ) : (
                  <CheckCircle2 size={14} />
                )}

                {reason}
              </span>
            );
          })}
        </div>
      </div>

      <div className="mt-5 flex items-start gap-2 border-t border-slate-100 pt-4 text-xs leading-relaxed text-slate-500">
        <AlertCircle
          size={16}
          className="shrink-0 text-amber-500"
        />

        <p>
          This is a suggested locality, not a verified
          building or delivery location.
        </p>
      </div>
    </article>
  );
}

// =====================================
// MAIN ADDRESS RESOLVER
// =====================================

export default function AddressResolver() {
  const { refreshUser } = useAuth();

  const [address, setAddress] =
    useState("");

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState("");

  const [result, setResult] =
    useState<AddressResolutionResponse | null>(
      null
    );

  const pending = useRef(false);

  function updateAddress(value: string) {
    setAddress(value);
    setResult(null);
    setError("");
  }

  function resetSearch() {
    updateAddress("");
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (pending.current) return;

    setError("");
    setResult(null);

    const trimmed = address.trim();

    // Frontend input validation
    if (trimmed.length < 3) {
      setError(
        "Please enter a meaningful address."
      );
      return;
    }

    if (address.length > MAX_LENGTH) {
      setError(
        "Address cannot exceed 300 characters."
      );
      return;
    }

    pending.current = true;
    setLoading(true);

    try {
      // Real authenticated Backend API request
      const response =
        await addressService.resolveAddress({
          address,
        });

      setResult(response);

    } catch (error) {
      if (
        error instanceof ApiError &&
        error.status === 401
      ) {
        setError(
          "Your session has expired. Please sign in again."
        );

        await refreshUser();

      } else {
        setError(
          error instanceof Error
            ? error.message
            : "Address resolution failed. Please try again."
        );
      }

    } finally {
      pending.current = false;
      setLoading(false);
    }
  }

  return (
    <div className="space-y-7">

      {/* Page Heading */}
      <section>
        <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
          <Sparkles size={15} />
          Intelligent Matching Engine
        </div>

        <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
          Address Resolver
        </h1>

        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-500 sm:text-base">
          Find possible localities from incomplete,
          mixed-language or misspelled addresses.
        </p>
      </section>

      {/* Address Search Form */}
      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">

        <div className="mb-6 flex items-center gap-3">

          <div className="rounded-xl bg-emerald-50 p-3 text-emerald-700">
            <ScanSearch size={25} />
          </div>

          <div>
            <h2 className="text-lg font-bold text-slate-900">
              Resolve a new address
            </h2>

            <p className="text-sm text-slate-500">
              Enter the address as you received it
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <label
            htmlFor="address"
            className="mb-2 block text-sm font-semibold text-slate-700"
          >
            Enter your address
          </label>

          <textarea
            id="address"
            value={address}
            onChange={(event) =>
              updateAddress(event.target.value)
            }
            placeholder="Example: বাসা ১২, Kazipra, মিরপুর, Dhaka"
            rows={5}
            maxLength={MAX_LENGTH}
            disabled={loading}
            required
            className="w-full resize-y rounded-2xl border border-slate-300 bg-slate-50 p-4 text-sm leading-relaxed text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 disabled:opacity-60"
          />

          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">

            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Languages
                size={16}
                className="text-emerald-600"
              />

              Bangla, English & known Banglish aliases
            </div>

            <span className="text-xs text-slate-400">
              {address.length}/{MAX_LENGTH}
            </span>
          </div>

          {/* Sample Addresses */}
          <div className="mt-5">

            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Try an example
            </p>

            <div className="flex flex-wrap gap-2">
              {EXAMPLES.map((example) => (
                <button
                  type="button"
                  key={example}
                  disabled={loading}
                  onClick={() => updateAddress(example)}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-xs text-slate-600 transition hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 disabled:opacity-50"
                >
                  {example}
                </button>
              ))}
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div
              role="alert"
              className="mt-5 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
            >
              <AlertCircle
                size={20}
                className="shrink-0"
              />

              {error}
            </div>
          )}

          {/* Buttons */}
          <div className="mt-6 flex flex-wrap gap-3">

            <button
              type="submit"
              disabled={
                loading || address.trim().length < 3
              }
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-6 py-3.5 text-sm font-bold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none"
            >
              {loading ? (
                <Loader2
                  size={20}
                  className="animate-spin"
                />
              ) : (
                <ScanSearch size={20} />
              )}

              {loading
                ? "Analyzing Address..."
                : "Resolve Address"}
            </button>

            <button
              type="button"
              disabled={loading}
              onClick={resetSearch}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-5 py-3.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
            >
              <RotateCcw size={18} />
              Clear
            </button>
          </div>
        </form>

        {/* Privacy Notice */}
        <div className="mt-6 flex items-start gap-3 border-t border-slate-100 pt-5">

          <ShieldCheck
            size={20}
            className="shrink-0 text-emerald-600"
          />

          <p className="text-xs leading-relaxed text-slate-500">
            Submitted addresses and matching results
            are saved to your account in encrypted
            storage using AES-256-GCM.
            Only submit addresses you are authorized
            to process.
          </p>
        </div>
      </section>

      {/* Current Dataset Notice */}
      <div className="flex items-start gap-3 rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-800">
        <AlertCircle size={19} className="shrink-0" />

        <p>
          Development dataset: Kazipara, Shewrapara
          and Mirpur 10. Nationwide coverage is not
          available yet.
        </p>
      </div>

      {/* Live Loading State */}
      {loading && (
        <section
          role="status"
          className="rounded-2xl border border-slate-200 bg-white p-10 text-center"
        >
          <Loader2
            size={35}
            className="mx-auto animate-spin text-emerald-600"
          />

          <h3 className="mt-4 font-bold text-slate-800">
            Resolving your address
          </h3>

          <p className="mt-2 text-sm text-slate-500">
            Checking locality names, aliases and
            spelling similarity...
          </p>
        </section>
      )}

      {/* Initial Empty State */}
      {!loading && !result && !error && (
        <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">

          <div className="mx-auto mb-4 w-fit rounded-full bg-slate-100 p-5 text-slate-400">
            <MapPin size={35} />
          </div>

          <h3 className="font-bold text-slate-800">
            Your results will appear here
          </h3>

          <p className="mt-2 text-sm text-slate-500">
            Enter an address to get ranked
            locality suggestions.
          </p>
        </section>
      )}

      {/* Live API Results */}
      {!loading && result && (
        <section
          aria-live="polite"
          className="space-y-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">

            <div>
              <h2 className="text-xl font-bold text-slate-900">
                Matching Results
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                {result.candidates.length} locality
                suggestion(s) found
              </p>
            </div>

            <span className="rounded-full bg-amber-50 px-4 py-2 text-xs font-semibold text-amber-700">
              {result.status === "no_confident_match"
                ? "No confident match"
                : "Needs review"}
            </span>
          </div>

          {result.ambiguous && (
            <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              <AlertCircle
                size={20}
                className="shrink-0"
              />

              Multiple possible localities were
              found. Compare the district and area
              before making a decision.
            </div>
          )}

          {result.candidates.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center">

              <SearchX
                size={45}
                className="mx-auto mb-4 text-amber-500"
              />

              <h3 className="text-lg font-bold text-slate-900">
                No confident locality match
              </h3>

              <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-slate-500">
                {result.message} Try adding the
                area or district, correcting the
                spelling, or using another address.
              </p>

              <button
                type="button"
                onClick={resetSearch}
                className="mt-5 rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800"
              >
                Try Another Address
              </button>
            </div>
          ) : (
            result.candidates.map(
              (candidate, index) => (
                <CandidateCard
                  key={candidate.localityId}
                  candidate={candidate}
                  index={index}
                />
              )
            )
          )}

          <div className="rounded-xl bg-slate-100 p-4 text-xs leading-relaxed text-slate-600">
            <strong>Important:</strong> Ranking scores
            are similarity-based scores, not
            probabilities of address accuracy.
            Locality confirmation and reviewer
            feedback will be available in the
            next development phase.
          </div>
        </section>
      )}
    </div>
  );
}