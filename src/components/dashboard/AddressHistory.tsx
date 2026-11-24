"use client";

import Link from "next/link";

import {
  useEffect,
  useRef,
  useState,
} from "react";

import {
  History,
  MapPin,
  Clock,
  ShieldCheck,
  Loader2,
  AlertCircle,
  RefreshCw,
  ScanSearch,
  Eye,
  X,
  ChevronDown,
  CheckCircle2,
} from "lucide-react";

import { useAuth } from "@/context/AuthContext";
import { ApiError } from "@/services/api";
import { addressService } from "@/services/address.service";

import AddressFeedback from "./AddressFeedback";

import {
  getAddressStatusLabel,
  type AddressHistoryItem,
  type AddressJobResponse,
  type AddressFeedbackResponse,
} from "@/types/address";

// =====================================
// HELPER FUNCTIONS
// =====================================

function formatDate(value: string) {
  return new Date(value).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Dhaka",
  });
}

function getErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Unable to load address data.";
}

function statusStyle(item: AddressHistoryItem) {
  if (item.status === "confirmed") {
    return "bg-emerald-50 text-emerald-700";
  }

  if (item.decision === "review_requested") {
    return "bg-amber-50 text-amber-700";
  }

  if (item.status === "no_confident_match") {
    return "bg-slate-100 text-slate-600";
  }

  return "bg-blue-50 text-blue-700";
}

// =====================================
// MAIN ADDRESS HISTORY COMPONENT
// =====================================

export default function AddressHistory() {
  const { refreshUser } = useAuth();

  const [items, setItems] =
    useState<AddressHistoryItem[]>([]);

  const [nextCursor, setNextCursor] =
    useState<string | null>(null);

  const [loading, setLoading] = useState(true);

  const [loadingMore, setLoadingMore] =
    useState(false);

  const [error, setError] = useState("");

  const [sessionExpired, setSessionExpired] =
    useState(false);

  const [detail, setDetail] =
    useState<AddressJobResponse | null>(null);

  const [detailLoading, setDetailLoading] =
    useState(false);

  const [detailError, setDetailError] =
    useState("");

  const dialogRef =
    useRef<HTMLDialogElement>(null);

  const detailRequestId = useRef(0);

  const pending = useRef(false);

  // =====================================
  // INITIAL HISTORY LOAD
  // =====================================

  useEffect(() => {
    let active = true;

    addressService
      .getHistory(10)
      .then((response) => {
        if (!active) return;

        setItems(response.items);

        setNextCursor(
          response.pagination.nextCursor
        );
      })
      .catch((error: unknown) => {
        if (!active) return;

        setError(getErrorMessage(error));

        setSessionExpired(
          error instanceof ApiError &&
          error.status === 401
        );
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  // =====================================
  // REFRESH & PAGINATION
  // =====================================

  async function loadPage(append = false) {
    if (
      pending.current ||
      loading ||
      loadingMore ||
      sessionExpired
    ) {
      return;
    }

    if (append && !nextCursor) return;

    pending.current = true;

    setError("");

    if (append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
    }

    try {
      const response =
        await addressService.getHistory(
          10,
          append ? nextCursor : null
        );

      if (append) {
        setItems((previous) => {
          const ids = new Set(
            previous.map((item) => item.jobId)
          );

          return [
            ...previous,
            ...response.items.filter(
              (item) => !ids.has(item.jobId)
            ),
          ];
        });
      } else {
        setItems(response.items);
      }

      setNextCursor(
        response.pagination.nextCursor
      );

    } catch (error) {
      setError(getErrorMessage(error));

      if (
        error instanceof ApiError &&
        error.status === 401
      ) {
        setSessionExpired(true);
        setItems([]);
        setNextCursor(null);
        await refreshUser();

      } else if (!append) {
        setItems([]);
        setNextCursor(null);
      }

    } finally {
      pending.current = false;
      setLoading(false);
      setLoadingMore(false);
    }
  }

  // =====================================
  // ADDRESS DETAILS
  // =====================================

  async function openDetails(jobId: string) {
    const dialog = dialogRef.current;

    if (!dialog || dialog.open) return;

    const requestId = ++detailRequestId.current;

    setDetail(null);
    setDetailError("");
    setDetailLoading(true);

    dialog.showModal();

    try {
      const response =
        await addressService.getAddressJob(jobId);

      if (detailRequestId.current === requestId) {
        setDetail(response);
      }

    } catch (error) {
      if (detailRequestId.current !== requestId) {
        return;
      }

      setDetailError(getErrorMessage(error));

      if (
        error instanceof ApiError &&
        error.status === 401
      ) {
        dialog.close();

        setItems([]);
        setNextCursor(null);
        setSessionExpired(true);

        await refreshUser();
      }

    } finally {
      if (detailRequestId.current === requestId) {
        setDetailLoading(false);
      }
    }
  }

  function handleDialogClose() {
    detailRequestId.current++;

    setDetail(null);
    setDetailError("");
    setDetailLoading(false);
  }

  // =====================================
  // UPDATE CONFIRMATION STATUS
  // =====================================

  function handleFeedbackUpdated(
    response: AddressFeedbackResponse
  ) {
    const changes = {
      status: response.status,
      decision: response.decision,
      selectedCandidate: response.selectedCandidate,
      requiresConfirmation:
        response.requiresConfirmation,
      updatedAt: response.updatedAt,
    };

    setItems((previous) =>
      previous.map((item) =>
        item.jobId === response.jobId
          ? { ...item, ...changes }
          : item
      )
    );

    setDetail((current) =>
      current && current.jobId === response.jobId
        ? { ...current, ...changes }
        : current
    );
  }

  // =====================================
  // PAGE UI
  // =====================================

  return (
    <div className="space-y-7">

      {/* Page Heading */}
      <section className="flex flex-wrap items-center justify-between gap-4">

        <div>
          <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
            <History size={15} />
            Merchant Workspace
          </div>

          <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            Address History
          </h1>

          <p className="mt-3 text-sm leading-relaxed text-slate-500">
            View and manage your previous address
            resolution requests.
          </p>
        </div>

        <Link
          href="/dashboard/resolve/"
          className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-800"
        >
          <ScanSearch size={19} />
          New Address
        </Link>

      </section>

      {/* History Toolbar */}
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">

        <div>
          <p className="font-semibold text-slate-800">
            Your Address Requests
          </p>

          <p className="mt-1 text-xs text-slate-500">
            {items.length} records currently loaded
          </p>
        </div>

        <button
          type="button"
          disabled={
            loading || loadingMore || sessionExpired
          }
          onClick={() => void loadPage()}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw
            size={17}
            className={loading ? "animate-spin" : ""}
          />
          Refresh
        </button>

      </section>

      {/* Error State */}
      {error && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-4"
        >
          <div className="flex items-start gap-3 text-sm text-red-700">

            <AlertCircle
              size={20}
              className="shrink-0"
            />

            {error}

          </div>

          {!sessionExpired && (
            <button
              type="button"
              onClick={() => void loadPage()}
              className="mt-3 text-sm font-semibold text-red-800 underline"
            >
              Try Again
            </button>
          )}

        </div>
      )}

      {sessionExpired && (
        <button
          type="button"
          onClick={() => void refreshUser()}
          className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white"
        >
          Refresh Session
        </button>
      )}

      {/* Loading State */}
      {loading && (
        <div
          role="status"
          className="rounded-2xl border border-slate-200 bg-white p-12 text-center"
        >
          <Loader2
            size={35}
            className="mx-auto animate-spin text-emerald-600"
          />

          <p className="mt-4 text-sm font-semibold text-slate-700">
            Loading your address history...
          </p>
        </div>
      )}

      {/* Empty History */}
      {!loading &&
        !error &&
        !sessionExpired &&
        items.length === 0 && (
          <section className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center">

            <div className="mx-auto mb-5 w-fit rounded-full bg-slate-100 p-5 text-slate-400">
              <History size={36} />
            </div>

            <h2 className="text-xl font-bold text-slate-900">
              No Address History Yet
            </h2>

            <p className="mt-2 text-sm text-slate-500">
              Your previous address requests
              will appear here.
            </p>

            <Link
              href="/dashboard/resolve/"
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-5 py-3 text-sm font-semibold text-white"
            >
              <ScanSearch size={18} />
              Resolve Your First Address
            </Link>

          </section>
      )}

      {/* =================================
          LIVE DATABASE RECORDS
      ================================= */}

      {!loading &&
        !sessionExpired &&
        items.length > 0 && (
          <section className="space-y-4">

            {items.map((item) => (
              <article
                key={item.jobId}
                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-emerald-200 sm:p-6"
              >

                <div className="flex flex-wrap items-start gap-4">

                  <div className="rounded-xl bg-emerald-50 p-3 text-emerald-700">
                    <MapPin size={24} />
                  </div>

                  <div className="min-w-0 flex-1">

                    {/* Status */}
                    <span
                      className={`inline-block rounded-full px-3 py-1.5 text-xs font-semibold ${statusStyle(item)}`}
                    >
                      {getAddressStatusLabel(
                        item.status,
                        item.decision
                      )}
                    </span>

                    {/* Original Address */}
                    <h3 className="mt-3 whitespace-pre-wrap break-words text-base font-bold text-slate-900">
                      {item.originalAddress}
                    </h3>

                    {/* Selected Locality */}
                    {item.selectedCandidate && (
                      <p className="mt-2 flex items-center gap-2 text-sm font-medium text-emerald-700">

                        <CheckCircle2
                          size={17}
                          className="shrink-0"
                        />

                        {
                          item.selectedCandidate
                            .locality.nameEn
                        }
                        {", "}
                        {
                          item.selectedCandidate
                            .locality.districtEn
                        }

                      </p>
                    )}

                    <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-500">

                      <span className="flex items-center gap-1.5">

                        <Clock size={14} />

                        {formatDate(item.createdAt)}

                      </span>

                      <span>
                        {item.candidateCount} suggestion(s)
                      </span>

                    </div>
                  </div>
                </div>

                {/* Card Footer */}
                <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">

                  <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">

                    <ShieldCheck
                      size={15}
                      className="text-emerald-600"
                    />

                    Encrypted at rest

                  </span>

                  <button
                    type="button"
                    disabled={loadingMore}
                    onClick={() =>
                      void openDetails(item.jobId)
                    }
                    className="inline-flex items-center gap-2 rounded-lg bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                  >
                    <Eye size={17} />
                    View Details
                  </button>

                </div>

              </article>
            ))}

            {/* Pagination */}
            {nextCursor ? (
              <div className="flex justify-center pt-3">

                <button
                  type="button"
                  disabled={loadingMore}
                  onClick={() => void loadPage(true)}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-6 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  {loadingMore ? (
                    <Loader2
                      size={18}
                      className="animate-spin"
                    />
                  ) : (
                    <ChevronDown size={18} />
                  )}

                  {loadingMore
                    ? "Loading..."
                    : "Load More"}

                </button>

              </div>
            ) : (
              <p className="py-4 text-center text-xs text-slate-400">
                You have reached the end of your history.
              </p>
            )}

          </section>
      )}

      {/* Security Notice */}
      <div className="flex items-start gap-3 rounded-xl border border-emerald-100 bg-emerald-50 p-4">

        <ShieldCheck
          size={20}
          className="shrink-0 text-emerald-700"
        />

        <p className="text-xs leading-relaxed text-emerald-800">
          Your private address content is encrypted
          at rest. The Merchant API only allows you
          to retrieve your own address requests.
        </p>

      </div>

      {/* =================================
          ADDRESS DETAILS MODAL
      ================================= */}

      <dialog
        ref={dialogRef}
        onClose={handleDialogClose}
        aria-labelledby="address-details-title"
        className="fixed inset-0 m-auto max-h-[85dvh] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto rounded-3xl border border-slate-200 bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-900/60"
      >

        {/* Modal Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-slate-200 bg-white p-5">

          <div>

            <h2
              id="address-details-title"
              className="text-lg font-bold"
            >
              Address Details
            </h2>

            <p className="mt-1 text-xs text-slate-500">
              Your private address request
            </p>

          </div>

          <button
            type="button"
            aria-label="Close address details"
            onClick={() => dialogRef.current?.close()}
            className="rounded-xl bg-slate-100 p-2 text-slate-600 hover:bg-slate-200"
          >
            <X size={22} />
          </button>

        </div>

        {/* Modal Body */}
        <div className="space-y-5 p-5 sm:p-6">

          {detailLoading && (
            <div
              role="status"
              className="py-12 text-center"
            >
              <Loader2
                size={36}
                className="mx-auto animate-spin text-emerald-600"
              />

              <p className="mt-3 text-sm text-slate-500">
                Loading address details...
              </p>
            </div>
          )}

          {detailError && (
            <div
              role="alert"
              className="rounded-xl bg-red-50 p-4 text-sm text-red-700"
            >
              {detailError}
            </div>
          )}

          {detail && !detailLoading && (
            <>

              {/* Original Address */}
              <section className="rounded-2xl bg-slate-50 p-4">

                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Original Address
                </p>

                <p className="mt-2 whitespace-pre-wrap break-words font-semibold text-slate-900">
                  {detail.originalAddress}
                </p>

                <p className="mt-3 text-sm font-medium text-emerald-700">
                  {getAddressStatusLabel(
                    detail.status,
                    detail.decision
                  )}
                </p>

              </section>

              {/* Date Information */}
              <div className="grid gap-3 sm:grid-cols-2">

                <div className="rounded-xl border border-slate-200 p-3">

                  <p className="text-xs text-slate-500">
                    Created At (BD time)
                  </p>

                  <p className="mt-1 text-sm font-medium">
                    {formatDate(detail.createdAt)}
                  </p>

                </div>

                <div className="rounded-xl border border-slate-200 p-3">

                  <p className="text-xs text-slate-500">
                    Last Updated (BD time)
                  </p>

                  <p className="mt-1 text-sm font-medium">
                    {formatDate(detail.updatedAt)}
                  </p>

                </div>

              </div>

              {/* Matching Suggestions */}
              <section className="space-y-3">

                <h3 className="font-bold text-slate-900">
                  Matching Suggestions
                  {" "}
                  ({detail.candidates.length})
                </h3>

                {detail.candidates.length === 0 && (
                  <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-800">
                    No confident locality match was found.
                  </p>
                )}

                {detail.candidates.map(
                  (candidate, index) => (
                    <div
                      key={candidate.localityId}
                      className="rounded-xl border border-slate-200 p-4"
                    >

                      <div className="flex items-start justify-between gap-3">

                        <div className="min-w-0">

                          <p className="text-xs text-slate-500">
                            Rank #{index + 1}
                          </p>

                          <p className="mt-1 break-words font-semibold text-slate-900">
                            {candidate.locality.nameEn}
                          </p>

                          <p className="mt-1 text-sm text-slate-600">
                            {candidate.locality.nameBn}
                          </p>

                          <p className="mt-1 text-xs text-slate-500">
                            {candidate.locality.areaEn}
                            {", "}
                            {candidate.locality.districtEn}
                          </p>

                        </div>

                        <div className="text-right">

                          <p className="text-xl font-bold text-emerald-700">
                            {candidate.score}/100
                          </p>

                          <p className="text-xs text-slate-400">
                            Ranking score
                          </p>

                        </div>

                      </div>

                      {/* Matching Reasons */}
                      <div className="mt-3 flex flex-wrap gap-2">

                        {candidate.reasons.map(
                          (reason, i) => (
                            <span
                              key={`${reason}-${i}`}
                              className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs text-slate-600"
                            >
                              {reason}
                            </span>
                          )
                        )}

                      </div>

                    </div>
                  )
                )}

              </section>

              {/* Confirmation & Feedback */}
              <AddressFeedback
                key={detail.jobId}
                jobId={detail.jobId}
                candidates={detail.candidates}
                status={detail.status}
                decision={detail.decision}
                selectedCandidate={
                  detail.selectedCandidate
                }
                onUpdated={handleFeedbackUpdated}
              />

            </>
          )}

        </div>

      </dialog>

    </div>
  );
}