"use client";

import ReviewerHandoffContext from "@/components/reviewer/ReviewerHandoffContext";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";

import {
  ShieldCheck,
  Clock,
  CheckCircle2,
  Flag,
  UserCheck,
  ListChecks,
  RefreshCw,
  Loader2,
  AlertCircle,
  FileText,
  MapPin,
  X,
  ChevronDown,
  Search,
} from "lucide-react";

import { useAuth } from "@/context/AuthContext";
import { ApiError } from "@/services/api";
import { reviewerService } from "@/services/reviewer.service";

import type {
  ReviewStatus,
  ReviewQueueItem,
  ReviewerStatisticsResponse,
  ReviewerQueueResponse,
  ReviewerDetailResponse,
  ApprovedReviewLocality,
  ReviewerDecisionInput,
} from "@/types/reviewer";

// =====================================
// COMMON CONFIGURATION
// =====================================

const tabs = [
  { value: "pending", label: "Pending Reviews" },
  { value: "resolved", label: "Resolved Reviews" },
  { value: "escalated", label: "Escalated Reviews" },
] as const;

const statusLabels = {
  pending: "Pending Review",
  resolved: "Resolved",
  escalated: "Escalated",
};

const statusColors = {
  pending: "bg-amber-50 text-amber-700",
  resolved: "bg-emerald-50 text-emerald-700",
  escalated: "bg-rose-50 text-rose-700",
};

const primaryButton =
  "inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50";

const secondaryButton =
  "inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50";

// =====================================
// HELPER FUNCTIONS
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

// =====================================
// BANGLA AND ENGLISH SEARCH
// =====================================

function normalizeSearch(value: string) {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[০-৯]/g, (digit) =>
      String("০১২৩৪৫৬৭৮৯".indexOf(digit))
    )
    .replace(/\p{Cf}/gu, "")
    .replace(/[\p{P}\p{Z}\s]+/gu, " ")
    .trim();
}

function localitySearchText(
  item: ApprovedReviewLocality
) {
  const l = item.locality;

  return normalizeSearch(
    [
      item.localityId,
      l.nameEn,
      l.nameBn,
      l.areaEn,
      l.areaBn,
      l.districtEn,
      l.districtBn,
      l.divisionEn,
      l.divisionBn,
    ]
      .filter(Boolean)
      .join(" ")
  );
}

// =====================================
// STATUS BADGE
// =====================================

function StatusBadge({
  status,
}: {
  status: ReviewStatus;
}) {
  return (
    <span
      className={`inline-flex rounded-full px-3 py-1.5 text-xs font-semibold ${statusColors[status]}`}
    >
      {statusLabels[status]}
    </span>
  );
}

// =====================================
// STATISTICS CARDS
// =====================================

function StatisticsCards({
  statistics,
  activeTab,
  disabled,
  onSelect,
}: {
  statistics: ReviewerStatisticsResponse;
  activeTab: ReviewStatus;
  disabled: boolean;
  onSelect: (status: ReviewStatus) => void;
}) {
  const { summary } = statistics;

  const cards = [
    {
      label: "Pending Reviews",
      value: summary.pending,
      icon: Clock,
      color: "bg-amber-50 text-amber-700",
      status: "pending",
      description: "Currently assigned to you",
    },
    {
      label: "Resolved Reviews",
      value: summary.resolved,
      icon: CheckCircle2,
      color: "bg-emerald-50 text-emerald-700",
      status: "resolved",
      description: "Requests with your recommendation",
    },
    {
      label: "Escalated Reviews",
      value: summary.escalated,
      icon: Flag,
      color: "bg-rose-50 text-rose-700",
      status: "escalated",
      description: "Requests needing further investigation",
    },
    {
      label: "Merchant Accepted",
      value: summary.merchantAccepted,
      icon: UserCheck,
      color: "bg-blue-50 text-blue-700",
      status: null,
      description: "Requests with a retained accepted recommendation",
    },
  ] as const;

  return (
    <section
      aria-label="Reviewer statistics"
      className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
    >
      {cards.map((card) => {
        const Icon = card.icon;
        const tab = card.status;

        const content = (
          <>
            <div
              className={`w-fit rounded-xl p-3 ${card.color}`}
            >
              <Icon size={24} />
            </div>

            <p className="mt-5 text-sm font-medium text-slate-500">
              {card.label}
            </p>

            <p className="mt-2 text-3xl font-bold text-slate-900">
              {card.value.toLocaleString("en-BD")}
            </p>

            <p className="mt-3 text-xs leading-relaxed text-slate-500">
              {card.description}
            </p>
          </>
        );

        if (tab === null) {
          return (
            <article
              key={card.label}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              {content}
            </article>
          );
        }

        return (
          <button
            type="button"
            key={card.label}
            disabled={disabled}
            aria-pressed={activeTab === tab}
            onClick={() => onSelect(tab)}
            className={`rounded-2xl border bg-white p-5 text-left shadow-sm transition hover:border-emerald-300 disabled:opacity-60 ${
              activeTab === tab
                ? "border-emerald-400"
                : "border-slate-200"
            }`}
          >
            {content}
          </button>
        );
      })}
    </section>
  );
}

// =====================================
// REVIEW QUEUE CARD
// =====================================

function ReviewCard({
  item,
  disabled,
  onOpen,
}: {
  item: ReviewQueueItem;
  disabled: boolean;
  onOpen: (jobId: string) => void;
}) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5">

      <div className="flex flex-wrap items-start justify-between gap-3">

        <div className="flex min-w-0 items-start gap-3">

          <div className="shrink-0 rounded-xl bg-slate-100 p-3 text-slate-600">
            <FileText size={22} />
          </div>

          <div className="min-w-0">
            <h3 className="font-semibold text-slate-900">
              Address Review Request
            </h3>

            <p className="mt-1 break-all font-mono text-xs text-slate-500">
              {item.jobId}
            </p>
          </div>

        </div>

        <StatusBadge status={item.reviewStatus} />

      </div>

      <div className="mt-5 grid gap-4 text-sm sm:grid-cols-2">

        <div>
          <p className="text-xs text-slate-500">
            Assigned At
          </p>
          <p className="mt-1 font-medium text-slate-700">
            {formatDate(item.assignedAt)}
          </p>
        </div>

        <div>
          <p className="text-xs text-slate-500">
            Address Revision
          </p>
          <p className="mt-1 font-medium text-slate-700">
            Version {item.revision}
          </p>
        </div>

        {item.decidedAt && (
          <div>
            <p className="text-xs text-slate-500">
              Decision Date
            </p>
            <p className="mt-1 font-medium text-slate-700">
              {formatDate(item.decidedAt)}
            </p>
          </div>
        )}

        {item.merchantDisposition && (
          <div>
            <p className="text-xs text-slate-500">
              Merchant Decision
            </p>

            <p className="mt-1 font-semibold text-slate-700">
              {item.merchantDisposition === "accepted"
                ? "Recommendation Accepted"
                : "Re-review Requested"}
            </p>

            {item.merchantDecidedAt && (
              <p className="mt-1 text-xs text-slate-500">
                {formatDate(item.merchantDecidedAt)}
              </p>
            )}
          </div>
        )}

      </div>

      {item.reviewStatus === "pending" ? (
        <button
          type="button"
          disabled={disabled}
          onClick={() => onOpen(item.jobId)}
          className={`mt-5 ${primaryButton}`}
        >
          <FileText size={17} />
          Open Review
        </button>
      ) : (
        <p className="mt-5 border-t border-slate-100 pt-3 text-xs text-slate-500">
          Completed review metadata only.
          Original address access is restricted.
        </p>
      )}

    </article>
  );
}

// =====================================
// MANUAL REVIEW DETAILS AND FORM
// =====================================

function ReviewDetails({
  jobId,
  onClose,
  onSessionExpired,
  onBusyChange,
  onCompleted,
  onRefreshNeeded,
}: {
  jobId: string;
  onClose: () => void;
  onSessionExpired: () => void;
  onBusyChange: (busy: boolean) => void;

  onCompleted: (
    status: "resolved" | "escalated",
    message: string
  ) => void;

  onRefreshNeeded: (message: string) => void;
}) {
  const [detail, setDetail] =
    useState<ReviewerDetailResponse | null>(null);

  const [localities, setLocalities] =
    useState<ApprovedReviewLocality[]>([]);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [error, setError] = useState("");
  const [localityWarning, setLocalityWarning] = useState("");

  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [note, setNote] = useState("");

  const [attempt, setAttempt] = useState(0);

  const submittingRef = useRef(false);

  // =================================
  // LOAD ADDRESS AND LOCALITIES
  // =================================

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const response =
          await reviewerService.getDetails(jobId);

        if (!active) return;

        let approved: ApprovedReviewLocality[] = [];
        let warning = "";

        try {
          const result =
            await reviewerService.getLocalities(jobId);

          approved = result.items;
        } catch (error: unknown) {
          // A dataset problem should not prevent
          // escalation of an authorized request.

          if (
            error instanceof ApiError &&
            error.status === 503
          ) {
            warning =
              "Approved locality data is unavailable. Refresh the details or escalate with a reason.";
          } else {
            throw error;
          }
        }

        if (!active) return;

        setDetail(response);
        setLocalities(approved);
        setLocalityWarning(warning);

      } catch (error: unknown) {
        if (!active) return;

        setDetail(null);
        setLocalities([]);

        if (
          error instanceof ApiError &&
          error.status === 401
        ) {
          onSessionExpired();
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
  }, [
    jobId,
    attempt,
    onSessionExpired,
  ]);

  // =================================
  // SEARCH APPROVED LOCALITIES
  // =================================

  const searchTerms = normalizeSearch(query)
    .split(" ")
    .filter(Boolean);

  const filteredLocalities =
    localities.filter((item) => {
      const text = localitySearchText(item);

      return searchTerms.every(
        (term) => text.includes(term)
      );
    });

  const selectedLocality = localities.find(
    (item) => item.localityId === selectedId
  );

  const noteLength = note.trim().length;

  const validNote =
    noteLength >= 5 &&
    noteLength <= 1000;

  const busy =
    loading || submitting;

  // =================================
  // REFRESH REVIEW DETAILS
  // =================================

  function refresh() {
    if (busy) return;

    setDetail(null);
    setLocalities([]);
    setSelectedId("");
    setQuery("");
    setNote("");
    setError("");
    setLocalityWarning("");
    setLoading(true);

    setAttempt((value) => value + 1);
  }

  // =================================
  // SELECT ENGINE SUGGESTION
  // =================================

  function selectLocality(localityId: string) {
    if (busy) return;

    if (
      !localities.some(
        (item) => item.localityId === localityId
      )
    ) {
      setError(
        "This locality is not in the approved dataset."
      );
      return;
    }

    setSelectedId(localityId);
    setQuery("");
    setError("");
  }

  // =================================
  // SUBMIT REVIEW DECISION
  // =================================

  async function submitDecision(
    decision: "resolved" | "escalated"
  ) {
    if (
      !detail ||
      busy ||
      submittingRef.current
    ) {
      return;
    }

    setError("");

    if (!validNote) {
      setError(
        "Write a review reason of 5–1000 characters."
      );
      return;
    }

    if (
      decision === "resolved" &&
      !selectedLocality
    ) {
      setError(
        "Select an approved locality first."
      );
      return;
    }

    const confirmation =
      decision === "resolved"
        ? `Recommend ${selectedLocality?.locality.nameEn} to the merchant?`
        : "Escalate this request for further investigation?";

    if (!window.confirm(confirmation)) {
      return;
    }

    const input: ReviewerDecisionInput =
      decision === "resolved"
        ? {
            decision: "resolved",
            localityId: selectedId,
            note: note.trim(),
            revision: detail.revision,
          }
        : {
            decision: "escalated",
            note: note.trim(),
            revision: detail.revision,
          };

    submittingRef.current = true;

    setSubmitting(true);
    onBusyChange(true);

    try {
      const result =
        await reviewerService.submitDecision(
          detail.jobId,
          detail.assignedAt,
          input
        );

      onCompleted(
        result.reviewStatus,
        result.message
      );

    } catch (error: unknown) {
      if (error instanceof ApiError) {
        if (error.status === 401) {
          onSessionExpired();
          return;
        }

        // A network failure may occur after
        // the backend has already committed.
        // Refresh before allowing another decision.

        if (
          error.status === 0 ||
          error.status === 403 ||
          error.status === 404 ||
          error.status === 409 ||
          error.status >= 500 ||
          error.code === "INVALID_RESPONSE" ||
          error.code === "INVALID_REVIEW_LOCALITY"
        ) {
          onRefreshNeeded(
            `${error.message} Workspace refreshed. Reopen the request before submitting another decision.`
          );

          return;
        }
      }

      setError(errorMessage(error));

    } finally {
      submittingRef.current = false;

      setSubmitting(false);
      onBusyChange(false);
    }
  }

  function handleRecommendation(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    void submitDecision("resolved");
  }

  // =================================
  // DETAILS UI
  // =================================

  return (
    <section
      aria-label="Manual review details"
      className="rounded-2xl border border-emerald-200 bg-white p-5 shadow-sm sm:p-6"
    >

      {/* HEADER */}

      <div className="flex items-start justify-between gap-3">

        <div>
          <h2 className="text-xl font-bold text-slate-900">
            Manual Address Review
          </h2>

          <p className="mt-2 break-all font-mono text-xs text-slate-500">
            {jobId}
          </p>
        </div>

        <button
          type="button"
          aria-label="Close review"
          disabled={submitting}
          onClick={onClose}
          className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-100 disabled:opacity-50"
        >
          <X size={20} />
        </button>

      </div>

      {loading && (
        <div
          role="status"
          className="flex items-center justify-center gap-3 py-10 text-sm text-slate-500"
        >
          <Loader2
            size={24}
            className="animate-spin text-emerald-700"
          />
          Loading authorized review...
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        >
          {error}
        </div>
      )}

      {!loading && !detail && (
        <button
          type="button"
          onClick={refresh}
          className={`mt-5 ${secondaryButton}`}
        >
          <RefreshCw size={17} />
          Retry Details
        </button>
      )}

      {!loading && detail && (
        <div className="mt-6 space-y-6">

          <div className="flex flex-wrap items-center justify-between gap-3">
            <StatusBadge status="pending" />

            <span className="text-xs font-medium text-slate-500">
              Revision {detail.revision}
            </span>
          </div>

          {/* ORIGINAL ADDRESS */}

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">

            <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-700">
              <MapPin
                size={19}
                className="text-emerald-700"
              />
              Merchant Submitted Address
            </h3>

            <>
    <p className="mt-3 whitespace-pre-wrap break-words text-lg font-medium leading-relaxed text-slate-900">
              {detail.originalAddress}
            </p>
    <ReviewerHandoffContext
      jobId={detail?.jobId}
      assignedAt={detail?.assignedAt}
      reviewStatus={detail?.reviewStatus}
    />
  </>

            <p className="mt-3 text-xs text-slate-500">
              Assigned: {formatDate(detail.assignedAt)}
            </p>

          </div>

          {detail.ambiguous && (
            <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-800">
              Multiple plausible matches were found.
              Investigate carefully before recommending a locality.
            </p>
          )}

          {/* MATCHING ENGINE SUGGESTIONS */}

          <div>

            <h3 className="font-bold text-slate-900">
              Matching Engine Suggestions
            </h3>

            {detail.candidates.length === 0 ? (
              <p className="mt-3 rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
                No confident locality match was found.
              </p>
            ) : (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">

                {detail.candidates.map((candidate) => {
                  const approved = localities.some(
                    (item) =>
                      item.localityId === candidate.localityId
                  );

                  return (
                    <article
                      key={candidate.localityId}
                      className="rounded-xl border border-slate-200 p-4"
                    >

                      <p className="font-semibold text-slate-900">
                        {candidate.locality.nameEn}
                      </p>

                      <p className="mt-1 text-sm text-slate-600">
                        {candidate.locality.nameBn}
                      </p>

                      <p className="mt-2 text-xs text-slate-500">
                        {[
                          candidate.locality.areaEn,
                          candidate.locality.districtEn,
                        ].filter(Boolean).join(", ")}
                      </p>

                      {typeof candidate.score === "number" && (
                        <p className="mt-3 text-xs font-semibold text-emerald-700">
                          Matching score: {candidate.score}
                        </p>
                      )}

                      <button
                        type="button"
                        disabled={!approved || busy}
                        onClick={() =>
                          selectLocality(candidate.localityId)
                        }
                        className={`mt-3 ${secondaryButton}`}
                      >
                        {!approved
                          ? "Unavailable"
                          : selectedId === candidate.localityId
                            ? "Selected"
                            : "Select Locality"}
                      </button>

                    </article>
                  );
                })}

              </div>
            )}

          </div>

          {/* REVIEW DECISION FORM */}

          <form
            onSubmit={handleRecommendation}
            className="space-y-5 border-t border-slate-200 pt-6"
          >

            <div>
              <h3 className="text-lg font-bold text-slate-900">
                Reviewer Recommendation
              </h3>

              <p className="mt-2 text-sm text-slate-500">
                Select an approved locality using
                the available address evidence.
                Do not guess an uncertain location.
              </p>
            </div>

            {localityWarning && (
              <p
                role="alert"
                className="rounded-xl bg-amber-50 p-4 text-sm text-amber-800"
              >
                {localityWarning}
              </p>
            )}

            {/* BILINGUAL LOCALITY SEARCH */}

            <div>
              <label
                htmlFor="review-locality-search"
                className="text-sm font-semibold text-slate-700"
              >
                Search Approved Localities
              </label>

              <div className="relative mt-2">

                <Search
                  size={20}
                  className="absolute left-3 top-3.5 text-slate-400"
                />

                <input
                  id="review-locality-search"
                  type="search"
                  value={query}
                  maxLength={150}
                  disabled={busy}
                  autoComplete="off"
                  onChange={(event) =>
                    setQuery(event.target.value)
                  }
                  placeholder="Search in Bangla or English..."
                  className="w-full rounded-xl border border-slate-200 py-3 pl-11 pr-4 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 disabled:bg-slate-50"
                />

              </div>

              <p className="mt-2 text-xs text-slate-500">
                {filteredLocalities.length} of{" "}
                {localities.length} approved localities
              </p>
            </div>

            {/* LOCALITY OPTIONS */}

            <fieldset
              disabled={busy}
              className="max-h-80 space-y-2 overflow-y-auto rounded-xl border border-slate-200 p-3"
            >
              <legend className="px-2 text-xs font-medium text-slate-500">
                Approved locality options
              </legend>

              {filteredLocalities.length === 0 && (
                <p className="p-4 text-center text-sm text-slate-500">
                  No matching approved locality found.
                </p>
              )}

              {filteredLocalities.map((item) => (
                <label
                  key={item.localityId}
                  className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition ${
                    selectedId === item.localityId
                      ? "border-emerald-500 bg-emerald-50"
                      : "border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  <input
                    type="radio"
                    name="review-locality"
                    value={item.localityId}
                    checked={selectedId === item.localityId}
                    onChange={() =>
                      setSelectedId(item.localityId)
                    }
                    className="mt-1 accent-emerald-700"
                  />

                  <span className="min-w-0">

                    <span className="block font-semibold text-slate-900">
                      {item.locality.nameEn}
                    </span>

                    <span className="mt-1 block text-sm text-slate-600">
                      {item.locality.nameBn}
                    </span>

                    <span className="mt-1 block text-xs text-slate-500">
                      {[
                        item.locality.areaEn,
                        item.locality.districtEn,
                        item.locality.divisionEn,
                      ].filter(Boolean).join(", ")}
                    </span>

                  </span>
                </label>
              ))}

            </fieldset>

            {/* SELECTED LOCALITY */}

            {selectedLocality && (
              <div className="flex items-start justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">

                <div className="flex items-start gap-3">

                  <CheckCircle2
                    size={22}
                    className="shrink-0 text-emerald-700"
                  />

                  <div>

                    <p className="text-xs font-medium text-emerald-700">
                      Selected Recommendation
                    </p>

                    <p className="mt-1 font-bold text-emerald-900">
                      {selectedLocality.locality.nameEn}
                      {" — "}
                      {selectedLocality.locality.nameBn}
                    </p>

                    <p className="mt-1 text-xs text-emerald-800">
                      {[
                        selectedLocality.locality.areaEn,
                        selectedLocality.locality.districtEn,
                      ].filter(Boolean).join(", ")}
                    </p>

                  </div>

                </div>

                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setSelectedId("")}
                  aria-label="Clear selected locality"
                  className="rounded-lg p-1 text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                >
                  <X size={19} />
                </button>

              </div>
            )}

            {/* REVIEWER REASON */}

            <div>
              <label
                htmlFor="reviewer-note"
                className="text-sm font-semibold text-slate-700"
              >
                Reviewer Reason
              </label>

              <textarea
                id="reviewer-note"
                rows={5}
                minLength={5}
                maxLength={1000}
                required
                disabled={busy}
                value={note}
                onChange={(event) =>
                  setNote(event.target.value)
                }
                placeholder="Explain the evidence supporting your recommendation or why further investigation is required..."
                className="mt-2 w-full resize-y rounded-xl border border-slate-200 p-4 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 disabled:bg-slate-50"
              />

              <div className="mt-2 flex flex-wrap justify-between gap-2 text-xs text-slate-500">

                <span>
                  Minimum 5 characters.
                </span>

                <span>
                  {noteLength}/1000
                </span>

              </div>
            </div>

            {/* SECURITY AND DECISION NOTICE */}

            <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4 text-xs leading-relaxed text-emerald-800">

              <div className="mb-2 flex items-center gap-2 font-semibold">

                <ShieldCheck size={18} />

                Secure Review Submission

              </div>

              Your recommendation and note are
              encrypted by the backend before storage.
              The merchant must separately accept
              the recommended locality.

              Avoid including unrelated personal
              information in your review note.

            </div>

            {/* DECISION BUTTONS */}

            <div className="grid gap-3 sm:grid-cols-2">

              <button
                type="submit"
                disabled={
                  busy ||
                  !validNote ||
                  !selectedLocality
                }
                className={primaryButton}
              >
                {submitting ? (
                  <Loader2
                    size={19}
                    className="animate-spin"
                  />
                ) : (
                  <CheckCircle2 size={19} />
                )}

                Submit Recommendation
              </button>

              <button
                type="button"
                disabled={busy || !validNote}
                onClick={() =>
                  void submitDecision("escalated")
                }
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-5 py-3 text-sm font-semibold text-amber-800 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Flag size={19} />
                Escalate Request
              </button>

            </div>

            {submitting && (
              <p
                role="status"
                className="text-center text-xs text-slate-500"
              >
                Submitting your review decision...
              </p>
            )}

            {error && (
              <p
                role="alert"
                className="rounded-xl bg-red-50 p-4 text-sm text-red-700"
              >
                {error}
              </p>
            )}

          </form>

          {/* DETAILS REFRESH */}

          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (
                (note.trim() || selectedId) &&
                !window.confirm(
                  "Refresh details and discard your unsaved review?"
                )
              ) {
                return;
              }

              refresh();
            }}
            className={secondaryButton}
          >
            <RefreshCw size={17} />
            Refresh Details
          </button>

        </div>
      )}

    </section>
  );
}

// =====================================
// MAIN REVIEWER WORKSPACE
// =====================================

export default function ReviewerWorkspace() {
  const { refreshUser } = useAuth();

  const [statistics, setStatistics] =
    useState<ReviewerStatisticsResponse | null>(null);

  const [items, setItems] =
    useState<ReviewQueueItem[]>([]);

  const [pagination, setPagination] =
    useState<ReviewerQueueResponse["pagination"] | null>(null);

  const [request, setRequest] = useState<{
    status: ReviewStatus;
    cursor: string | null;
    append: boolean;
  }>({
    status: "pending",
    cursor: null,
    append: false,
  });

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [expired, setExpired] = useState(false);

  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [warning, setWarning] = useState("");

  const [selectedJob, setSelectedJob] =
    useState<string | null>(null);

  // =================================
  // EXPIRED SESSION HANDLING
  // =================================

  const handleExpired = useCallback(() => {
    setExpired(true);
    setStatistics(null);
    setItems([]);
    setPagination(null);
    setSelectedJob(null);
    setNotice("");
    setWarning("");
    setError(
      "Your session has expired. Please sign in again."
    );
  }, []);

  // =================================
  // FETCH STATISTICS AND REVIEW QUEUE
  // =================================

  useEffect(() => {
    let active = true;

    Promise.all([
      reviewerService.getStatistics(),

      reviewerService.getQueue({
        status: request.status,
        cursor: request.cursor,
        limit: 10,
      }),
    ])

      .then(([stats, queue]) => {
        if (!active) return;

        setStatistics(stats);
        setPagination(queue.pagination);

        setItems((previous) => {
          if (!request.append) {
            return queue.items;
          }

          const unique = new Map(
            previous.map((item) => [
              item.jobId,
              item,
            ])
          );

          for (const item of queue.items) {
            unique.set(item.jobId, item);
          }

          return [...unique.values()];
        });
      })

      .catch((error: unknown) => {
        if (!active) return;

        setStatistics(null);
        setItems([]);
        setPagination(null);
        setSelectedJob(null);

        if (
          error instanceof ApiError &&
          error.status === 401
        ) {
          handleExpired();
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
  }, [request, handleExpired]);

  // =================================
  // QUEUE LOADING
  // =================================

  function loadQueue(
    status: ReviewStatus,
    cursor: string | null = null,
    message = "",
    warningMessage = ""
  ) {
    if (loading || expired) return;

    setSelectedJob(null);
    setError("");
    setNotice(message);
    setWarning(warningMessage);
    setLoading(true);

    if (!cursor) {
      setItems([]);
      setPagination(null);
      setStatistics(null);
    }

    setRequest({
      status,
      cursor,
      append: Boolean(cursor),
    });
  }

  function changeQueue(status: ReviewStatus) {
    if (submitting) return;

    loadQueue(status);
  }

  // =================================
  // DECISION SUCCESS
  // =================================

  function handleCompleted(
    status: "resolved" | "escalated",
    message: string
  ) {
    setSelectedJob(null);

    loadQueue(
      status,
      null,
      message
    );
  }

  function handleRefreshNeeded(message: string) {
    setSelectedJob(null);

    loadQueue(
      "pending",
      null,
      "",
      message
    );
  }

  const activeTab = request.status;

  const busy =
    loading || submitting || expired;

  // =================================
  // DASHBOARD UI
  // =================================

  return (
    <div className="space-y-7">

      {/* PAGE HEADER */}

      <section className="flex flex-wrap items-start justify-between gap-4">

        <div>

          <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">

            <ShieldCheck size={16} />
            Authorized Reviewer

          </div>

          <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            Reviewer Dashboard
          </h1>

          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-500 sm:text-base">
            Review assigned addresses, recommend approved
            localities and escalate uncertain requests.
          </p>

        </div>

        <button
          type="button"
          disabled={busy}
          onClick={() => changeQueue(activeTab)}
          className={primaryButton}
        >
          <RefreshCw
            size={18}
            className={loading ? "animate-spin" : ""}
          />
          Refresh Workspace
        </button>

      </section>

      {/* STATISTICS */}

      {statistics && (
        <>
          <StatisticsCards
            statistics={statistics}
            activeTab={activeTab}
            disabled={busy}
            onSelect={changeQueue}
          />

          <p className="text-xs leading-relaxed text-slate-500">
            Updated: {formatDate(statistics.generatedAt)}
            {" (Bangladesh time). "}
            Counts represent distinct existing requests
            within each category. Categories may overlap
            across review cycles.
          </p>
        </>
      )}

      {/* SUCCESS NOTICE */}

      {notice && (
        <div
          role="status"
          className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"
        >
          <CheckCircle2
            size={22}
            className="shrink-0"
          />
          <p>{notice}</p>
        </div>
      )}

      {/* CONFLICT WARNING */}

      {warning && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800"
        >
          <AlertCircle
            size={22}
            className="shrink-0"
          />
          <p>{warning}</p>
        </div>
      )}

      {/* ERROR STATE */}

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700"
        >
          <div className="flex items-start gap-3">
            <AlertCircle
              size={22}
              className="shrink-0"
            />
            <p>{error}</p>
          </div>

          <button
            type="button"
            disabled={loading}
            onClick={() => {
              if (expired) {
                void refreshUser();
              } else {
                loadQueue(activeTab);
              }
            }}
            className="mt-4 rounded-lg bg-red-700 px-4 py-2.5 font-semibold text-white disabled:opacity-50"
          >
            {expired
              ? "Refresh Session"
              : "Try Again"}
          </button>
        </div>
      )}

      {/* REVIEW FORM */}

      {selectedJob && !expired && (
        <ReviewDetails
          key={selectedJob}
          jobId={selectedJob}
          onClose={() =>
            setSelectedJob(null)
          }
          onSessionExpired={handleExpired}
          onBusyChange={setSubmitting}
          onCompleted={handleCompleted}
          onRefreshNeeded={handleRefreshNeeded}
        />
      )}

      {/* REVIEW QUEUE */}

      {!expired && (
        <section className="min-w-0 space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">

          <div>

            <h2 className="flex items-center gap-2 text-xl font-bold text-slate-900">

              <ListChecks
                size={22}
                className="text-emerald-700"
              />

              Review Workspace

            </h2>

            <p className="mt-2 text-sm text-slate-500">
              Only your assigned requests and retained
              review history are available here.
            </p>

          </div>

          {/* STATUS TABS */}

          <div className="flex flex-wrap gap-2 border-b border-slate-100 pb-4">

            {tabs.map((tab) => (
              <button
                type="button"
                key={tab.value}
                aria-pressed={activeTab === tab.value}
                disabled={busy}
                onClick={() => changeQueue(tab.value)}
                className={`rounded-xl px-4 py-3 text-sm font-semibold transition disabled:opacity-60 ${
                  activeTab === tab.value
                    ? "bg-emerald-700 text-white"
                    : "border border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                {tab.label}
              </button>
            ))}

          </div>

          {/* QUEUE CARDS */}

          <div className="space-y-3">

            {items.map((item) => (
              <ReviewCard
                key={item.jobId}
                item={item}
                disabled={busy}
                onOpen={(jobId) => {
                  setNotice("");
                  setWarning("");
                  setSelectedJob(jobId);
                }}
              />
            ))}

          </div>

          {loading && (
            <div
              role="status"
              className="flex items-center justify-center gap-3 py-10 text-sm text-slate-500"
            >

              <Loader2
                size={24}
                className="animate-spin text-emerald-700"
              />

              Loading review requests...

            </div>
          )}

          {!loading && !error && items.length === 0 && (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center">

              <FileText
                size={36}
                className="mx-auto text-slate-400"
              />

              <h3 className="mt-4 font-semibold text-slate-900">
                No {activeTab} reviews
              </h3>

              <p className="mt-2 text-sm text-slate-500">
                There are no matching review requests
                assigned to your account.
              </p>

            </div>
          )}

          {/* CURSOR PAGINATION */}

          {pagination && items.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">

              <p className="text-xs text-slate-500">
                {items.length} request(s) loaded
              </p>

              {pagination.hasMore &&
                pagination.nextCursor && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      loadQueue(
                        activeTab,
                        pagination.nextCursor
                      )
                    }
                    className={secondaryButton}
                  >
                    Load More
                    <ChevronDown size={17} />
                  </button>
                )}

            </div>
          )}

        </section>
      )}

      {/* SECURITY NOTICE */}

      <div className="flex items-start gap-3 rounded-xl border border-emerald-100 bg-emerald-50 p-4">

        <ShieldCheck
          size={21}
          className="shrink-0 text-emerald-700"
        />

        <p className="text-xs leading-relaxed text-emerald-800">
          Private address content is available only
          for currently assigned pending reviews.
          Completed review history contains metadata only.
          Review data is not saved in browser local storage.
        </p>

      </div>

    </div>
  );
}