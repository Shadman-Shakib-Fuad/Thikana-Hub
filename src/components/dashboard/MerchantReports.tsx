"use client";
import BrandLogo from "@/components/branding/BrandLogo";

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";

import Link from "next/link";

import {
  FileText,
  FileSpreadsheet,
  FileDown,
  CalendarDays,
  RefreshCw,
  Loader2,
  AlertCircle,
  ShieldCheck,
  CheckCircle2,
  BarChart3,
} from "lucide-react";

import { useAuth } from "@/context/AuthContext";

import { ApiError } from "@/services/api";

import { analyticsService } from "@/services/analytics.service";

import {
  exportAnalyticsPDF,
  exportAnalyticsCSV,
} from "@/utils/report-export";

import type {
  AnalyticsResponse,
  AnalyticsDateFilter,
  AnalyticsPeriod,
} from "@/types/analytics";

// =====================================
// DATE HELPERS
// =====================================

const MIN_DATE = "2020-01-01";

function todayDhaka() {
  const parts = new Intl.DateTimeFormat(
    "en-GB",
    {
      timeZone: "Asia/Dhaka",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }
  ).formatToParts(new Date());

  const get = (type: string) =>
    parts.find(
      (part) => part.type === type
    )?.value;

  return `${get("year")}-${get("month")}-${get("day")}`;
}

function presetRange(
  days: number
): AnalyticsDateFilter {
  const to = todayDhaka();

  const start = new Date(
    `${to}T00:00:00.000Z`
  );

  start.setUTCDate(
    start.getUTCDate() - days + 1
  );

  return {
    from: start.toISOString().slice(0, 10),
    to,
  };
}

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(
    `${value}T00:00:00.000Z`
  );

  return (
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
  );
}

function validateRange(
  range: AnalyticsDateFilter
) {
  if (
    !validDate(range.from) ||
    !validDate(range.to)
  ) {
    return "Select both valid dates.";
  }

  if (range.from < MIN_DATE) {
    return "Select dates from 2020 onward.";
  }

  if (range.from > range.to) {
    return "Start date cannot be after end date.";
  }

  if (range.to > todayDhaka()) {
    return "Future dates are not allowed.";
  }

  const days =
    Math.round(
      (
        Date.parse(range.to) -
        Date.parse(range.from)
      ) / 86400000
    ) + 1;

  if (days > 90) {
    return "Maximum reporting period is 90 days.";
  }

  return "";
}

function formatTimestamp(value: string) {
  return new Date(value).toLocaleString(
    "en-GB",
    {
      timeZone: "Asia/Dhaka",
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }
  );
}

// =====================================
// REPORT PREVIEW COMPONENT
// =====================================

function ReportPreview({
  data,
}: {
  data: AnalyticsResponse;
}) {
  const summary = data.summary;

  const metrics = [
    ["Total Addresses", summary.total],
    ["Confirmed", summary.confirmed],
    ["Review Requested", summary.reviewRequested],
    ["Awaiting Decision", summary.awaitingDecision],
    ["No Confident Match", summary.noConfidentMatch],
    ["Saved Addresses", summary.saved],
    [
      "Confirmation Rate",
      summary.total === 0
        ? "N/A"
        : `${summary.confirmationRate}%`,
    ],
    ["Reporting Days", data.range.days],
  ] as const;

  const maxDaily = Math.max(
    1,
    ...data.daily.map(
      (day) => day.total
    )
  );

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">

      {/* Branded header */}

      <div className="border-b-4 border-emerald-500 bg-slate-900 p-6 text-white sm:p-8">

        <div className="flex items-center justify-between gap-3">

          <div>
            <p className="flex items-center gap-2 text-2xl font-bold">
              <BrandLogo variant="icon" decorative />
              ThikanaHub
            </p>

            <p className="mt-1 text-xs text-slate-300">
              Secure Address Resolution Engine
            </p>
          </div>

          <FileText
            size={36}
            className="text-emerald-400"
          />

        </div>

      </div>

      <div className="space-y-7 p-5 sm:p-8">

        {/* Report title */}

        <div>
          <h2 className="text-2xl font-bold text-slate-900">
            Merchant Analytics Report
          </h2>

          <p className="mt-3 text-sm text-slate-600">
            Period: {data.range.from}
            {" to "}
            {data.range.to}
          </p>

          <p className="mt-1 text-xs text-slate-500">
            Generated: {formatTimestamp(data.generatedAt)}
            {" (UTC+6)"}
          </p>
        </div>

        {/* Summary statistics */}

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">

          {metrics.map(([label, value]) => (
            <article
              key={label}
              className="rounded-xl border border-slate-100 bg-slate-50 p-4"
            >

              <p className="text-xs text-slate-500">
                {label}
              </p>

              <p className="mt-2 break-words text-2xl font-bold text-emerald-700">
                {typeof value === "number"
                  ? value.toLocaleString("en-BD")
                  : value}
              </p>

            </article>
          ))}

        </div>

        {/* Activity chart */}

        <div>

          <h3 className="mb-4 font-bold text-slate-900">
            Daily Address Activity
          </h3>

          <div className="overflow-x-auto pb-3">

            <div
              className="grid gap-2"
              style={{
                gridTemplateColumns:
                  `repeat(${data.daily.length}, minmax(40px, 1fr))`,

                minWidth:
                  `${Math.max(280, data.daily.length * 48)}px`,
              }}
            >

              {data.daily.map((day) => (
                <div
                  key={day.date}
                  className="min-w-0 text-center"
                  title={`${day.date}: ${day.total} requests`}
                >

                  <div className="flex h-40 flex-col items-center justify-end border-b border-slate-200 pb-1">

                    <span className="mb-2 text-xs font-medium text-slate-600">
                      {day.total}
                    </span>

                    <div
                      className={`w-3/5 max-w-10 rounded-t-md ${
                        day.total === 0
                          ? "bg-slate-200"
                          : "bg-emerald-500"
                      }`}
                      style={{
                        height:
                          `${Math.max(
                            2,
                            day.total / maxDaily * 110
                          )}px`,
                      }}
                    />

                  </div>

                  <p className="mt-2 whitespace-nowrap text-[10px] text-slate-500">
                    {day.date.slice(5)}
                  </p>

                </div>
              ))}

            </div>
          </div>

        </div>

        {/* Daily statistics table */}

        <div>

          <h3 className="mb-4 font-bold text-slate-900">
            Daily Statistics
          </h3>

          <div className="max-h-[450px] overflow-auto rounded-xl border border-slate-200">

            <table className="w-full min-w-[760px] border-collapse text-left text-sm">

              <thead className="sticky top-0 bg-slate-900 text-white">

                <tr>
                  {[
                    "Date",
                    "Total",
                    "Confirmed",
                    "Review",
                    "Pending",
                    "No Match",
                    "Saved",
                    "Rate",
                  ].map((label) => (
                    <th
                      key={label}
                      scope="col"
                      className="whitespace-nowrap px-4 py-3 text-xs font-semibold"
                    >
                      {label}
                    </th>
                  ))}
                </tr>

              </thead>

              <tbody>

                {data.daily.map((day) => {
                  const rate =
                    day.total === 0
                      ? "N/A"
                      : `${(
                          day.confirmed /
                          day.total *
                          100
                        ).toFixed(1)}%`;

                  return (
                    <tr
                      key={day.date}
                      className="border-b border-slate-100 odd:bg-white even:bg-slate-50"
                    >

                      {[
                        day.date,
                        day.total,
                        day.confirmed,
                        day.reviewRequested,
                        day.awaitingDecision,
                        day.noConfidentMatch,
                        day.saved,
                        rate,
                      ].map((value, index) => (
                        <td
                          key={index}
                          className="whitespace-nowrap px-4 py-3 text-slate-700"
                        >
                          {value}
                        </td>
                      ))}

                    </tr>
                  );
                })}

              </tbody>
            </table>
          </div>

        </div>

        {/* Report notes */}

        <div className="rounded-xl bg-slate-50 p-4 text-xs leading-relaxed text-slate-600">

          <p className="mb-2 font-semibold text-slate-800">
            Report Notes
          </p>

          <p>
            Statistics represent existing address requests
            grouped by their original creation date.
            Deleted requests are excluded.
            Saved addresses are a separate bookmark metric.
            No Confident Match is a subset of Awaiting Decision.
            Confirmation rate does not measure independently
            verified address accuracy.
          </p>

        </div>

        <div className="border-t border-slate-200 pt-4 text-center text-xs text-slate-400">
          Generated by ThikanaHub | Confidential Merchant Report
        </div>

      </div>

    </section>
  );
}

// =====================================
// MAIN REPORTS DASHBOARD
// =====================================

export default function MerchantReports() {
  const { refreshUser } = useAuth();

  const [data, setData] =
    useState<AnalyticsResponse | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  const [notice, setNotice] =
    useState("");

  const [expired, setExpired] =
    useState(false);

  const [period, setPeriod] =
    useState<AnalyticsPeriod>("7");

  const [customOpen, setCustomOpen] =
    useState(false);

  const [draftRange, setDraftRange] =
    useState<AnalyticsDateFilter>(
      () => presetRange(7)
    );

  const [rangeError, setRangeError] =
    useState("");

  const [exporting, setExporting] =
    useState<"pdf" | "csv" | null>(null);

  const exportPending = useRef(false);

  const [request, setRequest] =
    useState<{
      range?: AnalyticsDateFilter;
    }>({});

  // =================================
  // LOAD REPORT DATA
  // =================================

  useEffect(() => {
    let active = true;

    analyticsService
      .getAnalytics(request.range)

      .then((response) => {
        if (!active) return;

        setData(response);
      })

      .catch((error: unknown) => {
        if (!active) return;

        setData(null);

        if (
          error instanceof ApiError &&
          error.status === 401
        ) {
          setExpired(true);
          setError("Your session has expired.");
        } else {
          setError(
            error instanceof Error
              ? error.message
              : "Unable to load report data."
          );
        }
      })

      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [request]);

  const busy =
    loading ||
    exporting !== null ||
    expired;

  // =================================
  // REPORT FILTERS
  // =================================

  function loadReport(
    range?: AnalyticsDateFilter
  ) {
    setLoading(true);
    setData(null);
    setError("");
    setNotice("");
    setRequest({ range });
  }

  function selectPreset(
    value: "7" | "30" | "90"
  ) {
    if (busy) return;

    const range = presetRange(
      Number(value)
    );

    setPeriod(value);
    setCustomOpen(false);
    setRangeError("");
    setDraftRange(range);

    loadReport(
      value === "7"
        ? undefined
        : range
    );
  }

  function openCustomRange() {
    if (busy) return;

    if (data) {
      setDraftRange({
        from: data.range.from,
        to: data.range.to,
      });
    }

    setRangeError("");
    setCustomOpen(true);
  }

  function applyCustomRange(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (busy) return;

    const validation =
      validateRange(draftRange);

    if (validation) {
      setRangeError(validation);
      return;
    }

    setRangeError("");
    setPeriod("custom");
    setCustomOpen(false);

    loadReport({
      from: draftRange.from,
      to: draftRange.to,
    });
  }

  function refreshReport() {
    if (busy) return;

    if (period === "custom") {
      loadReport(request.range);
    } else {
      loadReport(
        period === "7"
          ? undefined
          : presetRange(Number(period))
      );
    }
  }

  // =================================
  // EXPORT REPORT
  // =================================

  async function downloadReport(
    format: "pdf" | "csv"
  ) {
    if (
      busy ||
      !data ||
      exportPending.current
    ) {
      return;
    }

    exportPending.current = true;

    setExporting(format);
    setError("");
    setNotice("");

    try {
      if (format === "pdf") {
        await exportAnalyticsPDF(data);
      } else {
        exportAnalyticsCSV(data);
      }

      setNotice(
        `${format.toUpperCase()} report generated. Download requested.`
      );

    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Unable to generate the report."
      );

    } finally {
      exportPending.current = false;

      setExporting(null);
    }
  }

  const filters = [
    { value: "7", label: "Last 7 Days" },
    { value: "30", label: "Last 30 Days" },
    { value: "90", label: "Last 90 Days" },
  ] as const;

  return (
    <div className="space-y-7">

      {/* Page header */}

      <section className="flex flex-wrap items-start justify-between gap-4">

        <div>

          <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">

            <FileText size={16} />

            Merchant Reports

          </div>

          <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            Analytics Reports
          </h1>

          <p className="mt-3 text-sm leading-relaxed text-slate-500">
            Generate and download professional
            address analytics reports.
          </p>

        </div>

        <Link
          href="/dashboard/analytics/"
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-100"
        >
          <BarChart3 size={18} />

          View Analytics
        </Link>

      </section>

      {/* Date range panel */}

      <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">

        <div className="flex flex-wrap items-center justify-between gap-3">

          <div className="flex items-center gap-3">

            <div className="rounded-xl bg-emerald-50 p-3 text-emerald-700">
              <CalendarDays size={23} />
            </div>

            <div>
              <h2 className="font-bold text-slate-900">
                Reporting Period
              </h2>

              <p className="mt-1 text-xs text-slate-500">
                Bangladesh time (UTC+6)
              </p>
            </div>

          </div>

          <button
            type="button"
            disabled={busy}
            onClick={refreshReport}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw
              size={17}
              className={loading ? "animate-spin" : ""}
            />

            Refresh
          </button>

        </div>

        <div className="flex flex-wrap gap-2">

          {filters.map((filter) => {
            const active =
              !customOpen &&
              period === filter.value;

            return (
              <button
                type="button"
                key={filter.value}
                disabled={busy}
                aria-pressed={active}
                onClick={() =>
                  selectPreset(filter.value)
                }
                className={`rounded-xl px-4 py-3 text-sm font-semibold disabled:opacity-50 ${
                  active
                    ? "bg-emerald-700 text-white"
                    : "border border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                {filter.label}
              </button>
            );
          })}

          <button
            type="button"
            disabled={busy}
            aria-pressed={
              customOpen ||
              period === "custom"
            }
            onClick={openCustomRange}
            className={`rounded-xl px-4 py-3 text-sm font-semibold disabled:opacity-50 ${
              customOpen || period === "custom"
                ? "bg-emerald-700 text-white"
                : "border border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
          >
            Custom Range
          </button>

        </div>

        {/* Custom date form */}

        {customOpen && (
          <form
            onSubmit={applyCustomRange}
            className="space-y-4 rounded-xl bg-slate-50 p-4"
          >

            <div className="grid gap-4 sm:grid-cols-2">

              <div>
                <label
                  htmlFor="report-from"
                  className="mb-2 block text-sm font-semibold text-slate-700"
                >
                  Start Date
                </label>

                <input
                  id="report-from"
                  type="date"
                  required
                  min={MIN_DATE}
                  max={todayDhaka()}
                  disabled={busy}
                  value={draftRange.from}
                  onChange={(event) => {
                    setRangeError("");

                    setDraftRange((previous) => ({
                      ...previous,
                      from: event.target.value,
                    }));
                  }}
                  className="w-full rounded-xl border border-slate-300 bg-white p-3 text-sm"
                />
              </div>

              <div>
                <label
                  htmlFor="report-to"
                  className="mb-2 block text-sm font-semibold text-slate-700"
                >
                  End Date
                </label>

                <input
                  id="report-to"
                  type="date"
                  required
                  min={MIN_DATE}
                  max={todayDhaka()}
                  disabled={busy}
                  value={draftRange.to}
                  onChange={(event) => {
                    setRangeError("");

                    setDraftRange((previous) => ({
                      ...previous,
                      to: event.target.value,
                    }));
                  }}
                  className="w-full rounded-xl border border-slate-300 bg-white p-3 text-sm"
                />
              </div>

            </div>

            {rangeError && (
              <p
                role="alert"
                className="rounded-lg bg-red-50 p-3 text-sm text-red-700"
              >
                {rangeError}
              </p>
            )}

            <p className="text-xs text-slate-500">
              Select a maximum of 90 days.
              Apply the range to update the report.
            </p>

            <div className="flex flex-wrap gap-2">

              <button
                type="submit"
                disabled={busy}
                className="rounded-xl bg-emerald-700 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
              >
                Apply Date Range
              </button>

              <button
                type="button"
                onClick={() =>
                  setCustomOpen(false)
                }
                disabled={busy}
                className="rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-600 disabled:opacity-50"
              >
                Cancel
              </button>

            </div>

          </form>
        )}

        {/* Applied range */}

        {data && (
          <p className="border-t border-slate-100 pt-4 text-sm font-medium text-slate-600">
            Applied period: {data.range.from}
            {" to "}
            {data.range.to}
            {" · "}
            {data.range.days} day(s)
          </p>
        )}

      </section>

      {/* Loading state */}

      {loading && (
        <div
          role="status"
          className="rounded-2xl border border-slate-200 bg-white p-12 text-center"
        >
          <Loader2
            size={36}
            className="mx-auto animate-spin text-emerald-600"
          />

          <p className="mt-4 text-sm text-slate-500">
            Preparing your report...
          </p>
        </div>
      )}

      {/* Error state */}

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700"
        >

          <div className="flex items-start gap-3">
            <AlertCircle
              size={20}
              className="shrink-0"
            />

            {error}
          </div>

          {!data && (
            <button
              type="button"
              onClick={() => {
                if (expired) {
                  void refreshUser();
                } else {
                  refreshReport();
                }
              }}
              className="mt-4 rounded-xl bg-red-700 px-4 py-2.5 font-semibold text-white"
            >
              {expired
                ? "Refresh Session"
                : "Try Again"}
            </button>
          )}

        </div>
      )}

      {/* Success notice */}

      {notice && (
        <div
          role="status"
          className="flex items-center gap-3 rounded-xl bg-emerald-50 p-4 text-sm font-medium text-emerald-800"
        >
          <CheckCircle2 size={20} />

          {notice}
        </div>
      )}

      {/* Export actions */}

      {!loading && data && !expired && (
        <>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">

            <h2 className="font-bold text-slate-900">
              Download Report
            </h2>

            <p className="mt-2 text-sm text-slate-500">
              Both formats use the report snapshot
              displayed below.
            </p>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">

              {/* PDF Download */}

              <button
                type="button"
                disabled={busy || customOpen}
                onClick={() =>
                  void downloadReport("pdf")
                }
                className="flex items-center gap-4 rounded-xl bg-emerald-700 p-5 text-left text-white transition hover:bg-emerald-800 disabled:opacity-50"
              >

                {exporting === "pdf" ? (
                  <Loader2
                    size={30}
                    className="shrink-0 animate-spin"
                  />
                ) : (
                  <FileDown
                    size={30}
                    className="shrink-0"
                  />
                )}

                <div>
                  <p className="font-bold">
                    {exporting === "pdf"
                      ? "Generating PDF..."
                      : "Download PDF"}
                  </p>

                  <p className="mt-1 text-xs text-emerald-100">
                    Branded report with charts
                  </p>
                </div>

              </button>

              {/* CSV Download */}

              <button
                type="button"
                disabled={busy || customOpen}
                onClick={() =>
                  void downloadReport("csv")
                }
                className="flex items-center gap-4 rounded-xl border border-slate-200 bg-slate-50 p-5 text-left text-slate-800 transition hover:bg-slate-100 disabled:opacity-50"
              >

                {exporting === "csv" ? (
                  <Loader2
                    size={30}
                    className="shrink-0 animate-spin text-emerald-700"
                  />
                ) : (
                  <FileSpreadsheet
                    size={30}
                    className="shrink-0 text-emerald-700"
                  />
                )}

                <div>
                  <p className="font-bold">
                    {exporting === "csv"
                      ? "Generating CSV..."
                      : "Download CSV"}
                  </p>

                  <p className="mt-1 text-xs text-slate-500">
                    Spreadsheet-compatible statistics
                  </p>
                </div>

              </button>

            </div>

            {customOpen && (
              <p className="mt-3 text-xs text-amber-700">
                Apply or cancel the custom date range
                before downloading.
              </p>
            )}

          </section>

          {/* Preview */}

          <div className="flex items-center justify-between gap-3">

            <h2 className="text-lg font-bold text-slate-900">
              Report Preview
            </h2>

            <span className="text-xs text-slate-500">
              Database statistics
            </span>

          </div>

          <ReportPreview data={data} />

        </>
      )}

      {/* Privacy notice */}

      <div className="flex items-start gap-3 rounded-xl border border-emerald-100 bg-emerald-50 p-4">

        <ShieldCheck
          size={21}
          className="shrink-0 text-emerald-700"
        />

        <div className="space-y-1 text-xs leading-relaxed text-emerald-800">

          <p className="font-semibold">
            Privacy-Friendly Report Export
          </p>

          <p>
            Reports include aggregate statistics only.
            Original addresses and account credentials
            are not included. Downloaded files remain
            on your device; keep them private.
          </p>

        </div>
      </div>

    </div>
  );
}