"use client";

import Link from "next/link";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  ListChecks,
  ShieldCheck,
  Clock,
  CheckCircle2,
  Flag,
  UserCheck,
  RefreshCw,
  Loader2,
  AlertCircle,
  MapPin,
  Bookmark,
  FileText,
  ChevronDown,
  X,
} from "lucide-react";

import { useAuth } from "@/context/AuthContext";
import { ApiError } from "@/services/api";

import { merchantReviewService } from "@/services/merchant-review.service";

import type {
  MerchantReviewResponse,
  MerchantReviewJobResponse,
  MerchantReviewHistoryItem,
  MerchantReviewHistoryResponse,
  MerchantReviewDecision,
} from "@/types/merchant-review";

// =====================================
// CONFIGURATION
// =====================================

const primaryButton =
  "inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50";

const secondaryButton =
  "inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50";

const reviewStatuses = {
  unassigned: {
    label: "Awaiting Assignment",
    color: "bg-slate-100 text-slate-700",
    icon: Clock,
    description:
      "Your request is waiting to be assigned to an authorized reviewer.",
  },

  pending: {
    label: "Review In Progress",
    color: "bg-amber-50 text-amber-700",
    icon: Clock,
    description:
      "Your address has been assigned for manual review.",
  },

  resolved: {
    label: "Recommendation Available",
    color: "bg-emerald-50 text-emerald-700",
    icon: CheckCircle2,
    description:
      "A reviewer has recommended an approved locality. Review it before accepting.",
  },

  escalated: {
    label: "Escalated",
    color: "bg-orange-50 text-orange-700",
    icon: Flag,
    description:
      "Further investigation is required before a locality can be recommended.",
  },

  accepted: {
    label: "Recommendation Accepted",
    color: "bg-blue-50 text-blue-700",
    icon: UserCheck,
    description:
      "You have accepted the reviewer recommendation.",
  },
};

// =====================================
// HELPERS
// =====================================

function formatDate(value: string | null) {
  if (!value) return "Not available";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Not available";
  }

  return date.toLocaleString("en-GB", {
    timeZone: "Asia/Dhaka",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "An unexpected error occurred.";
}

function isAccessLost(error: unknown) {
  return (
    error instanceof ApiError &&
    (error.status === 401 || error.status === 403)
  );
}

function isManualReview(
  item: MerchantReviewHistoryItem
) {
  return (
    item.decision === "review_requested" ||
    (
      item.decision === "confirmed" &&
      item.selectedCandidate?.matchType ===
        "manual_review"
    )
  );
}

// =====================================
// REVIEW HISTORY CARD
// =====================================

function ReviewCard({
  item,
  selected,
  disabled,
  onOpen,
}: {
  item: MerchantReviewHistoryItem;
  selected: boolean;
  disabled: boolean;
  onOpen: (jobId: string) => void;
}) {
  const accepted =
    item.decision === "confirmed" &&
    item.selectedCandidate?.matchType ===
      "manual_review";

  return (
    <article
      className={`rounded-2xl border bg-white p-5 ${
        selected
          ? "border-emerald-400"
          : "border-slate-200"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="shrink-0 rounded-xl bg-emerald-50 p-3 text-emerald-700">
            <MapPin size={22} />
          </div>

          <div className="min-w-0">
            <h3 className="font-bold text-slate-900">
              Manual Address Review
            </h3>

            <p className="mt-1 break-all font-mono text-xs text-slate-500">
              {item.jobId}
            </p>
          </div>
        </div>

        <span
          className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
            accepted
              ? "bg-emerald-50 text-emerald-700"
              : "bg-amber-50 text-amber-700"
          }`}
        >
          {accepted
            ? "Accepted"
            : "Review Requested"}
        </span>
      </div>

      <p className="mt-4 whitespace-pre-wrap break-words rounded-xl bg-slate-50 p-4 text-sm leading-relaxed text-slate-800">
        {item.originalAddress}
      </p>

      <div className="mt-4 grid gap-3 text-xs text-slate-500 sm:grid-cols-2">
        <div>
          <p>Address Revision</p>
          <p className="mt-1 font-medium text-slate-700">
            Version {item.revision}
          </p>
        </div>

        <div>
          <p>Last Updated</p>
          <p className="mt-1 font-medium text-slate-700">
            {formatDate(item.updatedAt)}
          </p>
        </div>
      </div>

      {accepted && item.selectedCandidate && (
        <div className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">
          <p className="font-semibold">
            {item.selectedCandidate.locality.nameEn}
            {" — "}
            {item.selectedCandidate.locality.nameBn}
          </p>

          <p className="mt-1 text-xs">
            Manual human review — Not AI-scored
          </p>

          {item.saved && (
            <p className="mt-2 flex items-center gap-1 text-xs">
              <Bookmark size={14} />
              Saved address
            </p>
          )}
        </div>
      )}

      <button
        type="button"
        disabled={disabled}
        onClick={() => onOpen(item.jobId)}
        className={`mt-4 ${primaryButton}`}
      >
        <FileText size={17} />
        View Review Result
      </button>
    </article>
  );
}

// =====================================
// REVIEW RESULT PANEL
// =====================================

interface ReviewSnapshot {
  review: MerchantReviewResponse;
  job: MerchantReviewJobResponse;
}

function ReviewResult({
  jobId,
  disabled,
  onClose,
  onBusyChange,
  onChanged,
  onAccessLost,
}: {
  jobId: string;
  disabled: boolean;
  onClose: () => void;
  onBusyChange: (busy: boolean) => void;
  onChanged: () => void;
  onAccessLost: () => void;
}) {
  const [snapshot, setSnapshot] =
    useState<ReviewSnapshot | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [submitting, setSubmitting] =
    useState(false);

  const [attempt, setAttempt] =
    useState(0);

  const [error, setError] =
    useState("");

  const [notice, setNotice] =
    useState("");

  const submissionLock = useRef(false);

  // =================================
  // FETCH CURRENT REVIEW AND ADDRESS
  // =================================

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const review =
          await merchantReviewService.getReview(jobId);

        const job =
          await merchantReviewService.getJob(jobId);

        if (!active) return;

        const expectedDecision =
          review.reviewStatus === "accepted"
            ? "confirmed"
            : "review_requested";

        if (
          review.jobId !== jobId ||
          job.jobId !== jobId ||
          review.revision !== job.revision ||
          review.addressStatus !== job.status ||
          job.decision !== expectedDecision
        ) {
          throw new Error(
            "The address or review changed while loading. Refresh the result."
          );
        }

        setSnapshot({
          review,
          job,
        });

      } catch (error: unknown) {
        if (!active) return;

        setSnapshot(null);

        if (isAccessLost(error)) {
          onAccessLost();
          return;
        }

        setError(errorMessage(error));

      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, [jobId, attempt, onAccessLost]);

  const busy =
    loading || submitting || disabled;

  function reloadDetails() {
    setSnapshot(null);
    setError("");
    setLoading(true);
    setAttempt((value) => value + 1);
  }

  // =================================
  // PROCESS MERCHANT DECISION
  // =================================

  async function submitDecision(
    decision: MerchantReviewDecision
  ) {
    if (
      !snapshot ||
      busy ||
      submissionLock.current
    ) {
      return;
    }

    const { review } = snapshot;

    const permitted =
      decision === "accept"
        ? review.canAccept
        : review.canRequestReReview;

    if (!permitted || !review.reviewVersion) {
      setError(
        "This recommendation cannot be processed. Refresh the review."
      );
      return;
    }

    const confirmation =
      decision === "accept"
        ? "Accept this locality recommendation and confirm your address?"
        : "Request another manual review? The current recommendation will be archived.";

    if (!window.confirm(confirmation)) {
      return;
    }

    submissionLock.current = true;
    setSubmitting(true);
    onBusyChange(true);
    setError("");
    setNotice("");

    try {
      const response =
        await merchantReviewService.submitDecision(
          jobId,
          {
            decision,
            revision: review.revision,
            reviewVersion: review.reviewVersion,
          }
        );

      setNotice(response.message);

      reloadDetails();
      onChanged();

    } catch (error: unknown) {
      if (isAccessLost(error)) {
        onAccessLost();
        return;
      }

      // Clear old decision token on failure.
      // Do not automatically repeat a mutation.

      setSnapshot(null);

      setError(
        `${errorMessage(error)} Refresh the result before making another decision.`
      );

      onChanged();

    } finally {
      submissionLock.current = false;
      setSubmitting(false);
      onBusyChange(false);
    }
  }

  // =================================
  // SAVE OR UNSAVE ADDRESS
  // =================================

  async function toggleSaved() {
    if (
      !snapshot ||
      busy ||
      submissionLock.current ||
      snapshot.review.reviewStatus !== "accepted"
    ) {
      return;
    }

    const nextSaved =
      !snapshot.job.saved;

    submissionLock.current = true;
    setSubmitting(true);
    onBusyChange(true);
    setError("");
    setNotice("");

    try {
      const result =
        await merchantReviewService.setSaved(
          jobId,
          snapshot.job.revision,
          nextSaved
        );

      setNotice(
        result.saved
          ? "Address saved successfully."
          : "Address removed from saved addresses."
      );

      reloadDetails();
      onChanged();

    } catch (error: unknown) {
      if (isAccessLost(error)) {
        onAccessLost();
        return;
      }

      setSnapshot(null);

      setError(
        `${errorMessage(error)} Refresh the result before retrying.`
      );

      onChanged();

    } finally {
      submissionLock.current = false;
      setSubmitting(false);
      onBusyChange(false);
    }
  }

  // =================================
  // RESULT DATA
  // =================================

  const review = snapshot?.review;
  const job = snapshot?.job;

  const status = review
    ? reviewStatuses[review.reviewStatus]
    : null;

  const recommendation =
    review?.outcome?.recommendation;

  const StatusIcon =
    status?.icon ?? Clock;

  return (
    <section
      aria-label="Merchant review result"
      className="rounded-2xl border border-emerald-200 bg-white p-5 shadow-sm sm:p-6"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">
            Review Result
          </h2>

          <p className="mt-2 break-all font-mono text-xs text-slate-500">
            {jobId}
          </p>
        </div>

        <button
          type="button"
          disabled={submitting}
          onClick={onClose}
          aria-label="Close review result"
          className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-100 disabled:opacity-50"
        >
          <X size={20} />
        </button>
      </div>

      {notice && (
        <div
          role="status"
          className="mt-4 flex items-start gap-2 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800"
        >
          <CheckCircle2
            size={20}
            className="shrink-0"
          />
          <p>{notice}</p>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        >
          {error}
        </div>
      )}

      {loading && (
        <div
          role="status"
          className="flex items-center justify-center gap-3 py-10 text-sm text-slate-500"
        >
          <Loader2
            size={24}
            className="animate-spin text-emerald-700"
          />
          Loading secure review result...
        </div>
      )}

      {!loading && review && job && status && (
        <div className="mt-5 space-y-5">

          {/* REVIEW STATUS */}

          <div className={`rounded-xl p-4 ${status.color}`}>
            <div className="flex items-center gap-2">
              <StatusIcon size={22} />

              <h3 className="font-bold">
                {status.label}
              </h3>
            </div>

            <p className="mt-2 text-sm leading-relaxed">
              {status.description}
            </p>
          </div>

          {/* ORIGINAL ADDRESS */}

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold text-slate-500">
              Original Address
            </p>

            <p className="mt-2 whitespace-pre-wrap break-words font-medium leading-relaxed text-slate-900">
              {job.originalAddress}
            </p>

            <p className="mt-3 text-xs text-slate-500">
              Revision {review.revision}
            </p>
          </div>

          {/* RECOMMENDED LOCALITY */}

          {recommendation && (
            <div className="rounded-xl border border-emerald-200 p-5">
              <p className="text-xs font-semibold text-emerald-700">
                Recommended Locality
              </p>

              <div className="mt-3 flex items-start gap-3">
                <MapPin
                  size={24}
                  className="shrink-0 text-emerald-700"
                />

                <div>
                  <h3 className="text-xl font-bold text-slate-900">
                    {recommendation.locality.nameEn}
                  </h3>

                  <p className="mt-1 text-base text-slate-700">
                    {recommendation.locality.nameBn}
                  </p>

                  <p className="mt-2 text-sm text-slate-500">
                    {[
                      recommendation.locality.areaEn,
                      recommendation.locality.districtEn,
                      recommendation.locality.divisionEn,
                    ].filter(Boolean).join(", ")}
                  </p>
                </div>
              </div>

              <div className="mt-4 flex items-center gap-2 rounded-lg bg-blue-50 p-3 text-xs font-medium text-blue-700">
                <UserCheck size={18} />
                Manual Human Review — Not AI-scored
              </div>
            </div>
          )}

          {/* REVIEWER NOTE */}

          {review.outcome && (
            <div className="rounded-xl border border-slate-200 p-4">
              <h3 className="font-semibold text-slate-900">
                Reviewer Note
              </h3>

              <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-700">
                {review.outcome.note ||
                  "No additional note available."}
              </p>

              <p className="mt-4 text-xs text-slate-500">
                Decision date:{" "}
                {formatDate(review.outcome.decidedAt)}
              </p>
            </div>
          )}

          {/* MERCHANT DECISION BUTTONS */}

          {(review.canAccept ||
            review.canRequestReReview) && (
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                disabled={
                  busy ||
                  !review.canAccept ||
                  !review.reviewVersion ||
                  !recommendation
                }
                onClick={() =>
                  void submitDecision("accept")
                }
                className={primaryButton}
              >
                <CheckCircle2 size={19} />
                Accept Recommendation
              </button>

              <button
                type="button"
                disabled={
                  busy ||
                  !review.canRequestReReview ||
                  !review.reviewVersion
                }
                onClick={() =>
                  void submitDecision("request_re_review")
                }
                className={secondaryButton}
              >
                <RefreshCw size={18} />
                Request Re-review
              </button>
            </div>
          )}

          {/* ACCEPTED ADDRESS BOOKMARK */}

          {review.reviewStatus === "accepted" && (
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                disabled={busy}
                onClick={() => void toggleSaved()}
                className={
                  job.saved
                    ? secondaryButton
                    : primaryButton
                }
              >
                <Bookmark
                  size={18}
                  fill={job.saved ? "currentColor" : "none"}
                />

                {job.saved
                  ? "Remove from Saved"
                  : "Save Address"}
              </button>

              <Link
                href="/dashboard/saved/"
                className={secondaryButton}
              >
                Saved Addresses
              </Link>
            </div>
          )}

          <div className="flex items-start gap-3 rounded-xl bg-slate-50 p-4 text-xs leading-relaxed text-slate-600">
            <ShieldCheck
              size={20}
              className="shrink-0 text-emerald-700"
            />

            <p>
              Reviewer recommendations are locality-level
              guidance, not independent verification of
              a physical delivery address. Review the
              evidence before accepting.
            </p>
          </div>

        </div>
      )}

      {submitting && (
        <p
          role="status"
          className="mt-4 flex items-center gap-2 text-sm text-slate-500"
        >
          <Loader2
            size={18}
            className="animate-spin"
          />
          Processing your request...
        </p>
      )}

      <button
        type="button"
        disabled={busy}
        onClick={reloadDetails}
        className={`mt-5 ${secondaryButton}`}
      >
        <RefreshCw size={17} />
        Refresh Review Result
      </button>
    </section>
  );
}

// =====================================
// MAIN MERCHANT REVIEW WORKSPACE
// =====================================

export default function MerchantReviewWorkspace() {
  const { refreshUser } = useAuth();

  const [items, setItems] =
    useState<MerchantReviewHistoryItem[]>([]);

  const [pagination, setPagination] =
    useState<
      MerchantReviewHistoryResponse["pagination"] | null
    >(null);

  const [request, setRequest] = useState<{
    cursor: string | null;
  }>({
    cursor: null,
  });

  const [loading, setLoading] =
    useState(true);

  const [submitting, setSubmitting] =
    useState(false);

  const [accessLost, setAccessLost] =
    useState(false);

  const [error, setError] =
    useState("");

  const [selectedJob, setSelectedJob] =
    useState<string | null>(null);

  // =================================
  // SESSION AND ROLE PROTECTION
  // =================================

  const handleAccessLost = useCallback(() => {
    setAccessLost(true);
    setItems([]);
    setPagination(null);
    setSelectedJob(null);

    setError(
      "Your session or account permission has changed. Please verify your session."
    );
  }, []);

  // =================================
  // LOAD MERCHANT HISTORY
  // =================================

  useEffect(() => {
    let active = true;

    merchantReviewService
      .getHistory(request.cursor)

      .then((response) => {
        if (!active) return;

        setPagination(response.pagination);

        setItems((previous) => {
          const allItems = new Map(
            request.cursor
              ? previous.map((item) => [
                  item.jobId,
                  item,
                ])
              : []
          );

          for (const item of response.items) {
            allItems.set(item.jobId, item);
          }

          return [...allItems.values()];
        });
      })

      .catch((error: unknown) => {
        if (!active) return;

        if (isAccessLost(error)) {
          handleAccessLost();
          return;
        }

        setError(errorMessage(error));
      })

      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [request, handleAccessLost]);

  // =================================
  // REFRESH AFTER REVIEW DECISION
  // =================================

  function reloadHistory() {
    setItems([]);
    setPagination(null);
    setError("");
    setLoading(true);
    setRequest({ cursor: null });
  }

  function loadMore() {
    if (
      loading ||
      submitting ||
      accessLost ||
      !pagination?.nextCursor
    ) {
      return;
    }

    setError("");
    setLoading(true);

    setRequest({
      cursor: pagination.nextCursor,
    });
  }

  const reviewItems =
    items.filter(isManualReview);

  const busy =
    loading || submitting || accessLost;

  return (
    <div className="space-y-7">

      {/* PAGE HEADER */}

      <section className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
            <ShieldCheck size={16} />
            Secure Review Workspace
          </div>

          <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            Manual Reviews
          </h1>

          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-500">
            Track manual address reviews, inspect
            recommendations and confirm the correct
            locality.
          </p>
        </div>

        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setSelectedJob(null);
            reloadHistory();
          }}
          className={primaryButton}
        >
          <RefreshCw
            size={18}
            className={
              loading ? "animate-spin" : ""
            }
          />
          Refresh Workspace
        </button>
      </section>

      {/* REVIEW INFORMATION */}

      <section className="grid gap-4 sm:grid-cols-2">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="w-fit rounded-xl bg-amber-50 p-3 text-amber-700">
            <Clock size={24} />
          </div>

          <p className="mt-4 text-sm text-slate-500">
            Review Requests Loaded
          </p>

          <p className="mt-2 text-3xl font-bold text-slate-900">
            {accessLost
              ? "—"
              : reviewItems.filter(
                  (item) =>
                    item.decision === "review_requested"
                ).length}
          </p>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="w-fit rounded-xl bg-emerald-50 p-3 text-emerald-700">
            <UserCheck size={24} />
          </div>

          <p className="mt-4 text-sm text-slate-500">
            Accepted Reviews Loaded
          </p>

          <p className="mt-2 text-3xl font-bold text-slate-900">
            {accessLost
              ? "—"
              : reviewItems.filter(
                  (item) =>
                    item.decision === "confirmed"
                ).length}
          </p>
        </article>
      </section>

      <p className="text-xs text-slate-500">
        Counts represent loaded history records only.
        Open an individual review for its current
        status.
      </p>

      {/* WORKSPACE ERROR */}

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700"
        >
          <div className="flex items-start gap-3">
            <AlertCircle
              size={21}
              className="shrink-0"
            />
            <p>{error}</p>
          </div>

          <button
            type="button"
            disabled={loading || submitting}
            onClick={() => {
              if (accessLost) {
                void refreshUser();
              } else {
                reloadHistory();
              }
            }}
            className={`mt-4 ${secondaryButton}`}
          >
            {accessLost
              ? "Verify Session"
              : "Retry Workspace"}
          </button>
        </div>
      )}

      {/* SELECTED REVIEW */}

      {selectedJob && !accessLost && (
        <ReviewResult
          key={selectedJob}
          jobId={selectedJob}
          disabled={loading}
          onClose={() => setSelectedJob(null)}
          onBusyChange={setSubmitting}
          onChanged={reloadHistory}
          onAccessLost={handleAccessLost}
        />
      )}

      {/* REVIEW LIST */}

      {!accessLost && (
        <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div>
            <h2 className="flex items-center gap-2 text-xl font-bold text-slate-900">
              <ListChecks
                size={23}
                className="text-emerald-700"
              />
              Your Manual Reviews
            </h2>

            <p className="mt-2 text-sm text-slate-500">
              Review requests and accepted manual
              recommendations from your own address history.
            </p>
          </div>

          {reviewItems.map((item) => (
            <ReviewCard
              key={item.jobId}
              item={item}
              selected={selectedJob === item.jobId}
              disabled={busy}
              onOpen={setSelectedJob}
            />
          ))}

          {loading && (
            <div
              role="status"
              className="flex items-center justify-center gap-3 py-8 text-sm text-slate-500"
            >
              <Loader2
                size={23}
                className="animate-spin text-emerald-700"
              />
              Loading review history...
            </div>
          )}

          {!loading &&
            !error &&
            reviewItems.length === 0 && (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
                <FileText
                  size={34}
                  className="mx-auto text-slate-400"
                />

                <h3 className="mt-3 font-semibold text-slate-900">
                  {pagination?.hasMore
                    ? "No manual reviews in loaded records"
                    : "No current manual reviews"}
                </h3>

                <p className="mt-2 text-sm text-slate-500">
                  {pagination?.hasMore
                    ? "Load more history records to find older reviews."
                    : "Manual review requests will appear here."}
                </p>

                <Link
                  href="/dashboard/resolve/"
                  className={`mt-5 ${secondaryButton}`}
                >
                  Resolve an Address
                </Link>
              </div>
            )}

          {/* PAGINATION */}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
            <p className="text-xs text-slate-500">
              {reviewItems.length} review(s) found in{" "}
              {items.length} loaded history records
            </p>

            {pagination?.hasMore &&
              pagination.nextCursor && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={loadMore}
                  className={secondaryButton}
                >
                  Load More
                  <ChevronDown size={17} />
                </button>
              )}
          </div>
        </section>
      )}

      {/* SECURITY NOTICE */}

      <div className="flex items-start gap-3 rounded-xl border border-emerald-100 bg-emerald-50 p-4 text-xs leading-relaxed text-emerald-800">
        <ShieldCheck
          size={21}
          className="shrink-0"
        />

        <p>
          Only your own address review results are
          accessible. Review decisions are protected by
          the current address revision and review version.
          Private review content is not saved to browser
          local storage.
        </p>
      </div>

    </div>
  );
}