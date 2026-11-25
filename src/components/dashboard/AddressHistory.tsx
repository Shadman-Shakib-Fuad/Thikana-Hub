"use client";

import Link from "next/link";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  History,
  Bookmark,
  BookmarkCheck,
  MapPin,
  Search,
  ScanSearch,
  RefreshCw,
  Loader2,
  AlertCircle,
  ShieldCheck,
  Eye,
  Pencil,
  Trash2,
  X,
  ChevronDown,
} from "lucide-react";

import { useAuth } from "@/context/AuthContext";
import { ApiError } from "@/services/api";
import { addressService } from "@/services/address.service";

import AddressFeedback from "./AddressFeedback";

import {
  getAddressStatusLabel,
  type AddressHistoryItem,
  type AddressJobResponse,
} from "@/types/address";

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

function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Unable to complete the request.";
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

function toHistoryItem(
  detail: AddressJobResponse
): AddressHistoryItem {
  return {
    jobId: detail.jobId,
    originalAddress: detail.originalAddress,
    status: detail.status,
    decision: detail.decision,
    candidateCount: detail.candidates.length,
    selectedCandidate: detail.selectedCandidate,
    requiresConfirmation: detail.requiresConfirmation,
    revision: detail.revision,
    saved: detail.saved,
    savedAt: detail.savedAt,
    createdAt: detail.createdAt,
    updatedAt: detail.updatedAt,
  };
}

// =====================================
// REUSABLE ADDRESS DETAILS MODAL
// =====================================

interface AddressDetailsProps {
  jobId: string;

  onClose: () => void;

  onChanged: (
    detail: AddressJobResponse
  ) => void;

  onDeleted: (
    jobId: string
  ) => void;

  onExpired: () => void;
}

function AddressDetails({
  jobId,
  onClose,
  onChanged,
  onDeleted,
  onExpired,
}: AddressDetailsProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  const pending = useRef(false);

  const [detail, setDetail] =
    useState<AddressJobResponse | null>(null);

  const [loading, setLoading] = useState(true);

  const [busy, setBusy] = useState(false);

  const [feedbackBusy, setFeedbackBusy] =
    useState(false);

  const [editing, setEditing] = useState(false);

  const [draft, setDraft] = useState("");

  const [error, setError] = useState("");

  const [notice, setNotice] = useState("");

  const [stale, setStale] = useState(false);

  const [reloadVersion, setReloadVersion] =
    useState(0);

  const isBusy = busy || feedbackBusy;

  useEffect(() => {
    const dialog = dialogRef.current;

    if (dialog && !dialog.open) {
      dialog.showModal();
    }
  }, []);

  useEffect(() => {
    let active = true;

    addressService
      .getAddressJob(jobId)

      .then((response) => {
        if (!active) return;

        setDetail(response);
        setDraft(response.originalAddress);
        onChanged(response);
      })

      .catch((error: unknown) => {
        if (!active) return;

        setError(errorMessage(error));

        if (
          error instanceof ApiError &&
          error.status === 401
        ) {
          onExpired();
        }
      })

      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [
    jobId,
    reloadVersion,
    onChanged,
    onExpired,
  ]);

  function refreshDetails() {
    if (isBusy || loading) return;

    setLoading(true);
    setDetail(null);
    setEditing(false);
    setStale(false);
    setError("");
    setNotice("");

    setReloadVersion((previous) => previous + 1);
  }

  function markConflict() {
    setStale(true);

    setError(
      "This address may have changed. Refresh the details before continuing."
    );
  }

  async function perform(
    action: () => Promise<void>
  ) {
    if (
      pending.current ||
      feedbackBusy ||
      stale
    ) {
      return;
    }

    pending.current = true;

    setBusy(true);
    setError("");
    setNotice("");

    try {
      await action();

    } catch (error) {
      if (error instanceof ApiError) {
        if (error.status === 401) {
          onExpired();
          return;
        }

        if ([0, 404, 409].includes(error.status)) {
          markConflict();
        }
      }

      setError(errorMessage(error));

    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  function applyDetail(updated: AddressJobResponse) {
    setDetail(updated);
    setDraft(updated.originalAddress);

    onChanged(updated);
  }

  async function submitEdit() {
    if (
      !detail ||
      detail.decision === "review_requested"
    ) {
      return;
    }

    const address = draft.trim();

    if (address.length < 3 || address.length > 300) {
      setError("Enter an address of 3–300 characters.");
      return;
    }

    if (address === detail.originalAddress.trim()) {
      setError("The address has not changed.");
      return;
    }

    const accepted = window.confirm(
      "Edit and resolve this address again? The previous confirmation and bookmark will be removed."
    );

    if (!accepted) return;

    await perform(async () => {
      const updated = await addressService.editAddress(
        detail.jobId,
        {
          address,
          revision: detail.revision,
        }
      );

      applyDetail(updated);

      setEditing(false);

      setNotice(
        "Address updated. Review and confirm the new matching results."
      );
    });
  }

  async function submitDelete() {
    if (
      !detail ||
      detail.decision === "review_requested"
    ) {
      return;
    }

    const accepted = window.confirm(
      "Delete this address from your history and saved addresses? This cannot be undone in the app."
    );

    if (!accepted) return;

    await perform(async () => {
      const response = await addressService.deleteAddress(
        detail.jobId,
        {
          revision: detail.revision,
        }
      );

      if (response.deleted) {
        onDeleted(detail.jobId);
      }
    });
  }

  const reviewLocked =
    detail?.decision === "review_requested";

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="address-details-title"
      onCancel={(event) => {
        event.preventDefault();

        if (!isBusy) onClose();
      }}
      className="fixed inset-0 m-auto max-h-[85dvh] w-[calc(100%-2rem)] max-w-3xl overflow-y-auto rounded-3xl border border-slate-200 bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-900/60"
    >
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-slate-200 bg-white p-5">

        <div>
          <h2
            id="address-details-title"
            className="text-xl font-bold"
          >
            Manage Address
          </h2>

          <p className="mt-1 text-xs text-slate-500">
            Private merchant workspace
          </p>
        </div>

        <button
          type="button"
          disabled={isBusy}
          aria-label="Close address details"
          onClick={onClose}
          className="rounded-xl bg-slate-100 p-2 text-slate-600 hover:bg-slate-200 disabled:opacity-50"
        >
          <X size={22} />
        </button>
      </div>

      <div className="space-y-5 p-5 sm:p-6">

        {loading && (
          <div role="status" className="py-12 text-center">
            <Loader2
              size={36}
              className="mx-auto animate-spin text-emerald-600"
            />

            <p className="mt-3 text-sm text-slate-500">
              Loading address details...
            </p>
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="rounded-xl bg-red-50 p-4 text-sm text-red-700"
          >
            {error}
          </div>
        )}

        {notice && (
          <div
            role="status"
            className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800"
          >
            {notice}
          </div>
        )}

        {!loading && (stale || !detail) && (
          <button
            type="button"
            disabled={isBusy}
            onClick={refreshDetails}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            <RefreshCw size={17} />
            Refresh Details
          </button>
        )}

        {detail && !loading && (
          <>
            <section className="rounded-2xl bg-slate-50 p-4">

              <div className="flex flex-wrap items-center gap-2">

                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${statusStyle(toHistoryItem(detail))}`}
                >
                  {getAddressStatusLabel(
                    detail.status,
                    detail.decision
                  )}
                </span>

                {detail.saved && (
                  <span className="flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                    <BookmarkCheck size={14} />
                    Saved
                  </span>
                )}

                <span className="text-xs text-slate-500">
                  Revision {detail.revision}
                </span>
              </div>

              <p className="mt-4 text-xs font-semibold uppercase text-slate-500">
                Original Address
              </p>

              <p className="mt-2 whitespace-pre-wrap break-words font-semibold text-slate-900">
                {detail.originalAddress}
              </p>

              <div className="mt-4 grid gap-2 text-xs text-slate-500 sm:grid-cols-2">
                <span>
                  Created: {formatDate(detail.createdAt)}
                </span>

                <span>
                  Updated: {formatDate(detail.updatedAt)}
                </span>

                {detail.savedAt && (
                  <span>
                    Saved: {formatDate(detail.savedAt)}
                  </span>
                )}
              </div>
            </section>

            {/* Edit and delete actions */}

            {!reviewLocked && (
              <div className="flex flex-wrap gap-3">

                <button
                  type="button"
                  disabled={isBusy || stale}
                  onClick={() => {
                    setDraft(detail.originalAddress);
                    setEditing((value) => !value);
                    setError("");
                    setNotice("");
                  }}
                  className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-50"
                >
                  <Pencil size={17} />

                  {editing ? "Cancel Edit" : "Edit Address"}
                </button>

                <button
                  type="button"
                  disabled={isBusy || stale || editing}
                  onClick={() => void submitDelete()}
                  className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
                >
                  <Trash2 size={17} />
                  Delete Address
                </button>
              </div>
            )}

            {reviewLocked && (
              <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-800">
                Edit and delete are locked while this
                request is awaiting manual review.
              </p>
            )}

            {/* Edit form */}

            {editing && !reviewLocked && !stale && (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void submitEdit();
                }}
                className="space-y-4 rounded-2xl border border-blue-200 bg-blue-50 p-5"
              >
                <label
                  htmlFor="edited-address"
                  className="block font-bold text-slate-900"
                >
                  Update Address
                </label>

                <textarea
                  id="edited-address"
                  rows={4}
                  required
                  maxLength={300}
                  value={draft}
                  disabled={isBusy}
                  onChange={(event) =>
                    setDraft(event.target.value)
                  }
                  className="w-full rounded-xl border border-slate-300 bg-white p-4 text-sm text-slate-800 outline-none focus:border-blue-500"
                />

                <div className="flex justify-between gap-2 text-xs text-slate-500">
                  <span>New matching results will be generated.</span>
                  <span>{draft.length}/300</span>
                </div>

                <button
                  type="submit"
                  disabled={
                    isBusy ||
                    draft.trim().length < 3 ||
                    draft.trim() === detail.originalAddress.trim()
                  }
                  className="inline-flex items-center gap-2 rounded-xl bg-blue-700 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
                >
                  {busy ? (
                    <Loader2 size={18} className="animate-spin" />
                  ) : (
                    <ScanSearch size={18} />
                  )}

                  Update & Re-resolve
                </button>
              </form>
            )}

            {/* Locality candidates */}

            {!editing && (
              <section className="space-y-3">

                <h3 className="font-bold text-slate-900">
                  Matching Suggestions ({detail.candidates.length})
                </h3>

                {detail.candidates.length === 0 && (
                  <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-800">
                    No confident locality match was found.
                  </p>
                )}

                {detail.candidates.map((candidate, index) => (
                  <article
                    key={candidate.localityId}
                    className="rounded-xl border border-slate-200 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">

                      <div className="min-w-0">
                        <p className="text-xs text-slate-500">
                          Rank #{index + 1}
                        </p>

                        <h4 className="mt-1 font-bold text-slate-900">
                          {candidate.locality.nameEn}
                        </h4>

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

                        <p className="text-xs text-slate-500">
                          Ranking score
                        </p>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {candidate.reasons.map((reason, i) => (
                        <span
                          key={`${reason}-${i}`}
                          className="rounded-lg bg-slate-100 px-2 py-1 text-xs text-slate-600"
                        >
                          {reason}
                        </span>
                      ))}
                    </div>
                  </article>
                ))}
              </section>
            )}

            {!editing && !busy && !stale && (
              <AddressFeedback
                key={`${detail.jobId}:${detail.revision}:${reloadVersion}`}
                jobId={detail.jobId}
                candidates={detail.candidates}
                status={detail.status}
                decision={detail.decision}
                selectedCandidate={detail.selectedCandidate}
                revision={detail.revision}
                saved={detail.saved}
                onBusyChange={setFeedbackBusy}
                onConflict={markConflict}

                onUpdated={(response) => {
                  applyDetail({
                    ...detail,
                    ...response,
                  });
                }}

                onSaved={(response) => {
                  applyDetail({
                    ...detail,
                    saved: response.saved,
                    savedAt: response.savedAt,
                    revision: response.revision,
                  });

                  setNotice(response.message);
                }}
              />
            )}
          </>
        )}
      </div>
    </dialog>
  );
}

// =====================================
// HISTORY AND SAVED ADDRESSES PAGE
// =====================================

interface AddressHistoryProps {
  savedOnly?: boolean;
}

export default function AddressHistory({
  savedOnly = false,
}: AddressHistoryProps) {
  const { refreshUser } = useAuth();

  const [items, setItems] =
    useState<AddressHistoryItem[]>([]);

  const [nextCursor, setNextCursor] =
    useState<string | null>(null);

  const [loading, setLoading] = useState(true);

  const [loadingMore, setLoadingMore] = useState(false);

  const [error, setError] = useState("");

  const [notice, setNotice] = useState("");

  const [query, setQuery] = useState("");

  const [filter, setFilter] = useState("all");

  const [detailId, setDetailId] =
    useState<string | null>(null);

  const pending = useRef(false);

  const [sessionExpired, setSessionExpired] =
    useState(false);

  const fetchPage = useCallback(
    (cursor?: string | null) =>
      savedOnly
        ? addressService.getSavedAddresses(10, cursor)
        : addressService.getHistory(10, cursor),

    [savedOnly]
  );

  // Load first page
  useEffect(() => {
    let active = true;

    fetchPage()
      .then((response) => {
        if (!active) return;

        setItems(response.items);
        setNextCursor(response.pagination.nextCursor);
      })

      .catch((error: unknown) => {
        if (!active) return;

        setError(errorMessage(error));

        if (
          error instanceof ApiError &&
          error.status === 401
        ) {
          setItems([]);
          setNextCursor(null);
          setSessionExpired(true);
        }
      })

      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [fetchPage]);

  // Refresh or load next page
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
    setNotice("");

    if (append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
    }

    try {
      const response = await fetchPage(
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

      setNextCursor(response.pagination.nextCursor);

    } catch (error) {
      setError(errorMessage(error));

      if (
        error instanceof ApiError &&
        error.status === 401
      ) {
        setSessionExpired(true);
        setItems([]);
        setNextCursor(null);

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

  // Synchronize edited, confirmed and bookmarked records
  const handleChanged = useCallback(
    (detail: AddressJobResponse) => {
      const updated = toHistoryItem(detail);

      setItems((previous) => {
        const remaining = previous.filter(
          (item) => item.jobId !== detail.jobId
        );

        if (savedOnly && !detail.saved) {
          return remaining;
        }

        return [...remaining, updated].sort(
          (a, b) => b.jobId.localeCompare(a.jobId)
        );
      });
    },

    [savedOnly]
  );

  const handleDeleted = useCallback(
    (jobId: string) => {
      setItems((previous) =>
        previous.filter((item) => item.jobId !== jobId)
      );

      setDetailId(null);

      setNotice("Address deleted successfully.");
    },

    []
  );

  const handleExpired = useCallback(() => {
    setDetailId(null);
    setItems([]);
    setNextCursor(null);
    setSessionExpired(true);
    setError("Your session has expired.");
  }, []);

  const normalizedQuery = query
    .normalize("NFKC")
    .toLowerCase()
    .trim();

  // Search and filter loaded records only
  const visibleItems = items.filter((item) => {
    const searchable = [
      item.originalAddress,
      item.selectedCandidate?.locality.nameEn,
      item.selectedCandidate?.locality.nameBn,
      item.selectedCandidate?.locality.areaEn,
      item.selectedCandidate?.locality.districtEn,
    ]
      .filter(Boolean)
      .join(" ")
      .normalize("NFKC")
      .toLowerCase();

    const matchesQuery =
      !normalizedQuery ||
      searchable.includes(normalizedQuery);

    const matchesFilter =
      filter === "all" ||
      (filter === "confirmed" && item.status === "confirmed") ||
      (filter === "review_requested" && item.decision === "review_requested") ||
      (filter === "pending" && !item.decision && item.status !== "confirmed") ||
      (filter === "saved" && item.saved);

    return matchesQuery && matchesFilter;
  });

  return (
    <div className="space-y-7">

      {/* Page header */}
      <section className="flex flex-wrap items-center justify-between gap-4">

        <div>
          <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
            {savedOnly ? (
              <Bookmark size={15} />
            ) : (
              <History size={15} />
            )}

            Merchant Workspace
          </div>

          <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            {savedOnly ? "Saved Addresses" : "Address History"}
          </h1>

          <p className="mt-3 text-sm text-slate-500">
            {savedOnly
              ? "Manage your bookmarked and confirmed addresses."
              : "Review and manage your address resolution requests."}
          </p>
        </div>

        <Link
          href="/dashboard/resolve/"
          className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-800"
        >
          <ScanSearch size={18} />
          New Address
        </Link>
      </section>

      {/* Search and filter toolbar */}
      <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">

        <div className="flex flex-wrap items-center justify-between gap-3">

          <div>
            <h2 className="font-semibold text-slate-900">
              Your Address Requests
            </h2>

            <p className="mt-1 text-xs text-slate-500">
              Showing {visibleItems.length} of {items.length} loaded records
            </p>
          </div>

          <button
            type="button"
            disabled={loading || loadingMore || sessionExpired}
            onClick={() => void loadPage()}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw
              size={17}
              className={loading ? "animate-spin" : ""}
            />

            Refresh
          </button>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">

          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3">

            <Search size={19} className="shrink-0 text-slate-400" />

            <input
              type="search"
              aria-label="Search loaded addresses"
              placeholder="Search loaded addresses..."
              value={query}
              maxLength={300}
              onChange={(event) =>
                setQuery(event.target.value)
              }
              className="min-w-0 flex-1 bg-transparent py-3 text-sm text-slate-800 outline-none"
            />
          </div>

          {!savedOnly && (
            <select
              aria-label="Filter address status"
              value={filter}
              onChange={(event) =>
                setFilter(event.target.value)
              }
              className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700"
            >
              <option value="all">All Statuses</option>
              <option value="confirmed">Confirmed</option>
              <option value="pending">Awaiting Decision</option>
              <option value="review_requested">Review Requested</option>
              <option value="saved">Bookmarked</option>
            </select>
          )}
        </div>

        <p className="text-xs text-slate-400">
          Search and filters apply to currently loaded records.
        </p>
      </section>

      {error && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-xl bg-red-50 p-4 text-sm text-red-700"
        >
          <AlertCircle size={20} className="shrink-0" />
          {error}
        </div>
      )}

      {notice && (
        <div
          role="status"
          className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800"
        >
          {notice}
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

      {loading && (
        <div role="status" className="rounded-2xl border border-slate-200 bg-white p-12 text-center">
          <Loader2
            size={35}
            className="mx-auto animate-spin text-emerald-600"
          />

          <p className="mt-4 text-sm text-slate-500">
            Loading your addresses...
          </p>
        </div>
      )}

      {/* Empty state */}
      {!loading &&
        !sessionExpired &&
        !error &&
        visibleItems.length === 0 && (
          <section className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center">

            <div className="mx-auto mb-4 w-fit rounded-full bg-slate-100 p-5 text-slate-400">
              {savedOnly ? (
                <Bookmark size={35} />
              ) : (
                <History size={35} />
              )}
            </div>

            <h2 className="text-xl font-bold text-slate-900">
              {items.length > 0
                ? "No Matching Records"
                : savedOnly
                  ? "No Saved Addresses Yet"
                  : "No Address History Yet"}
            </h2>

            <p className="mt-2 text-sm text-slate-500">
              {items.length > 0
                ? "Try another search or filter."
                : savedOnly
                  ? "Confirm and bookmark an address to see it here."
                  : "Your previous address requests will appear here."}
            </p>

            {items.length > 0 ? (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setFilter("all");
                }}
                className="mt-5 rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white"
              >
                Clear Filters
              </button>
            ) : (
              <Link
                href={
                  savedOnly
                    ? "/dashboard/history/"
                    : "/dashboard/resolve/"
                }
                className="mt-5 inline-block rounded-xl bg-emerald-700 px-5 py-3 text-sm font-semibold text-white"
              >
                {savedOnly
                  ? "Browse Search History"
                  : "Resolve Your First Address"}
              </Link>
            )}
          </section>
        )}

      {/* Live address cards */}
      {!loading && !sessionExpired && (
        <section className="space-y-4">

          {visibleItems.map((item) => (
            <article
              key={item.jobId}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:border-emerald-200 sm:p-6"
            >
              <div className="flex items-start gap-4">

                <div className="rounded-xl bg-emerald-50 p-3 text-emerald-700">
                  <MapPin size={24} />
                </div>

                <div className="min-w-0 flex-1">

                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusStyle(item)}`}>
                      {getAddressStatusLabel(
                        item.status,
                        item.decision
                      )}
                    </span>

                    {item.saved && (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                        <BookmarkCheck size={15} />
                        Saved
                      </span>
                    )}
                  </div>

                  <h3 className="mt-3 whitespace-pre-wrap break-words font-bold text-slate-900">
                    {item.originalAddress}
                  </h3>

                  {item.selectedCandidate && (
                    <p className="mt-2 text-sm font-medium text-emerald-700">
                      {item.selectedCandidate.locality.nameEn}
                      {", "}
                      {item.selectedCandidate.locality.districtEn}
                    </p>
                  )}

                  <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-500">
                    <span>{formatDate(item.createdAt)}</span>
                    <span>Revision {item.revision}</span>
                    <span>{item.candidateCount} suggestion(s)</span>
                  </div>
                </div>
              </div>

              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">

                <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                  <ShieldCheck size={15} className="text-emerald-600" />
                  Encrypted at rest
                </span>

                <button
                  type="button"
                  disabled={loadingMore}
                  onClick={() => setDetailId(item.jobId)}
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                >
                  <Eye size={17} />
                  Manage Address
                </button>
              </div>
            </article>
          ))}

          {nextCursor && (
            <div className="flex justify-center pt-3">
              <button
                type="button"
                disabled={loadingMore}
                onClick={() => void loadPage(true)}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-6 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                {loadingMore ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <ChevronDown size={18} />
                )}

                {loadingMore ? "Loading..." : "Load More"}
              </button>
            </div>
          )}

          {!nextCursor && items.length > 0 && (
            <p className="py-3 text-center text-xs text-slate-400">
              You have reached the end of your records.
            </p>
          )}
        </section>
      )}

      <div className="flex items-start gap-3 rounded-xl border border-emerald-100 bg-emerald-50 p-4">
        <ShieldCheck
          size={20}
          className="shrink-0 text-emerald-700"
        />

        <p className="text-xs leading-relaxed text-emerald-800">
          Private address content is encrypted at rest.
          Only authorized account holders can access
          their own address requests.
        </p>
      </div>

      {detailId && (
        <AddressDetails
          key={detailId}
          jobId={detailId}
          onClose={() => setDetailId(null)}
          onChanged={handleChanged}
          onDeleted={handleDeleted}
          onExpired={handleExpired}
        />
      )}
    </div>
  );
}