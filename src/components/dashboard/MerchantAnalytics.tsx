"use client";

import {
  useEffect,
  useState,
  type FormEvent,
} from "react";

import {
  BarChart3,
  MapPin,
  CheckCircle2,
  Clock,
  Bookmark,
  ListChecks,
  SearchX,
  PieChart,
  CalendarDays,
  RefreshCw,
  Loader2,
  AlertCircle,
  ShieldCheck,
  ScanSearch,
  type LucideIcon,
} from "lucide-react";

import Link from "next/link";

import { useAuth } from "@/context/AuthContext";

import { ApiError } from "@/services/api";

import { analyticsService } from "@/services/analytics.service";

import type {
  AnalyticsResponse,
  AnalyticsDateFilter,
  AnalyticsPeriod,
  AnalyticsSummary,
  DailyAnalytics,
} from "@/types/analytics";

// =====================================
// CONSTANTS
// =====================================

const TIME_ZONE = "Asia/Dhaka";

const MIN_DATE = "2020-01-01";

const MAX_DAYS = 90;

const DAY_MS = 24 * 60 * 60 * 1000;

// =====================================
// DATE HELPERS
// =====================================

function getDhakaToday() {
  const parts = new Intl.DateTimeFormat(
    "en-GB",
    {
      timeZone: TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }
  ).formatToParts(new Date());

  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value;

  return `${get("year")}-${get("month")}-${get("day")}`;
}

function addDays(date: string, days: number) {
  const value = new Date(
    `${date}T00:00:00.000Z`
  );

  value.setUTCDate(
    value.getUTCDate() + days
  );

  return value.toISOString().slice(0, 10);
}

function getPresetRange(
  days: number
): AnalyticsDateFilter {
  const today = getDhakaToday();

  return {
    from: addDays(today, -(days - 1)),
    to: today,
  };
}

function isValidDate(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return false;
  }

  const value = new Date(
    `${date}T00:00:00.000Z`
  );

  return (
    !Number.isNaN(value.getTime()) &&
    value.toISOString().slice(0, 10) === date
  );
}

function validateRange(
  range: AnalyticsDateFilter
) {
  if (
    !isValidDate(range.from) ||
    !isValidDate(range.to)
  ) {
    return "Please select both valid dates.";
  }

  if (range.from < MIN_DATE) {
    return "Select a date from 2020 onward.";
  }

  if (range.from > range.to) {
    return "Start date cannot be after end date.";
  }

  if (range.to > getDhakaToday()) {
    return "Future dates are not allowed.";
  }

  const from = Date.parse(
    `${range.from}T00:00:00.000Z`
  );

  const to = Date.parse(
    `${range.to}T00:00:00.000Z`
  );

  const days =
    Math.round((to - from) / DAY_MS) + 1;

  if (days > MAX_DAYS) {
    return "Select a maximum of 90 days.";
  }

  return "";
}

function formatDate(
  date: string,
  includeYear = false
) {
  return new Date(
    `${date}T00:00:00.000Z`
  ).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",

    ...(includeYear
      ? { year: "numeric" as const }
      : {}),

    timeZone: "UTC",
  });
}

function formatTimestamp(value: string) {
  return new Date(value).toLocaleString(
    "en-GB",
    {
      timeZone: TIME_ZONE,
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }
  );
}

function formatNumber(value: number) {
  return value.toLocaleString("en-BD");
}

// =====================================
// STATISTICS CARD COMPONENT
// =====================================

interface StatCardProps {
  label: string;
  value: number | string;
  description: string;
  icon: LucideIcon;
  color: string;
}

function StatCard({
  label,
  value,
  description,
  icon: Icon,
  color,
}: StatCardProps) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-emerald-200 hover:shadow-md">

      <div className="flex items-start justify-between gap-3">

        <div
          className={`w-fit rounded-xl p-3 ${color}`}
        >
          <Icon size={23} />
        </div>

        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-slate-500">
          LIVE DATA
        </span>

      </div>

      <p className="mt-5 text-sm font-medium text-slate-500">
        {label}
      </p>

      <p className="mt-2 break-words text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
        {typeof value === "number"
          ? formatNumber(value)
          : value}
      </p>

      <p className="mt-3 text-xs leading-relaxed text-slate-400">
        {description}
      </p>

    </article>
  );
}

// =====================================
// ALL STATISTICS CARDS
// =====================================

function StatisticsCards({
  summary,
}: {
  summary: AnalyticsSummary;
}) {
  const cards: StatCardProps[] = [
    {
      label: "Total Addresses",

      value: summary.total,

      description:
        "Existing requests created in this period",

      icon: MapPin,

      color: "bg-blue-50 text-blue-700",
    },

    {
      label: "Confirmed",

      value: summary.confirmed,

      description:
        "Localities confirmed by the merchant",

      icon: CheckCircle2,

      color: "bg-emerald-50 text-emerald-700",
    },

    {
      label: "Review Requested",

      value: summary.reviewRequested,

      description:
        "Requests marked for manual review",

      icon: Clock,

      color: "bg-amber-50 text-amber-700",
    },

    {
      label: "Saved Addresses",

      value: summary.saved,

      description:
        "Currently bookmarked address requests",

      icon: Bookmark,

      color: "bg-violet-50 text-violet-700",
    },

    {
      label: "Awaiting Decision",

      value: summary.awaitingDecision,

      description:
        "Requests without a merchant decision",

      icon: ListChecks,

      color: "bg-slate-100 text-slate-700",
    },

    {
      label: "No Confident Match",

      value: summary.noConfidentMatch,

      description:
        "Unmatched requests awaiting a decision",

      icon: SearchX,

      color: "bg-rose-50 text-rose-700",
    },

    {
      label: "Confirmation Rate",

      value: `${summary.confirmationRate}%`,

      description:
        "Confirmed requests divided by total requests",

      icon: PieChart,

      color: "bg-teal-50 text-teal-700",
    },
  ];

  return (
    <section
      aria-label="Analytics statistics"
      className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
    >
      {cards.map((card) => (
        <StatCard
          key={card.label}
          {...card}
        />
      ))}
    </section>
  );
}

// =====================================
// INTERACTIVE DAILY ACTIVITY CHART
// =====================================

function ActivityChart({
  daily,
}: {
  daily: DailyAnalytics[];
}) {
  const [selectedDate, setSelectedDate] =
    useState<string | null>(null);

  const selected =
    daily.find(
      (item) => item.date === selectedDate
    ) ??
    daily[daily.length - 1];

  const maxValue = Math.max(
    1,
    ...daily.map((item) => item.total)
  );

  const total = daily.reduce(
    (sum, item) => sum + item.total,
    0
  );

  return (
    <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">

      <div className="flex flex-wrap items-start justify-between gap-3">

        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">

            <BarChart3
              size={21}
              className="text-emerald-700"
            />

            Daily Address Activity

          </h2>

          <p className="mt-2 text-xs leading-relaxed text-slate-500">
            Select a day to view its current address statistics.
          </p>
        </div>

        <div className="rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
          {formatNumber(total)} total
        </div>

      </div>

      {total === 0 && (
        <div className="mt-5 rounded-xl bg-slate-50 p-3 text-sm text-slate-500">
          No address requests exist in this date range.
        </div>
      )}

      <div className="mt-6 overflow-x-auto pb-4">

        <div
          className="grid gap-2"
          style={{
            gridTemplateColumns:
              `repeat(${daily.length}, minmax(42px, 1fr))`,

            minWidth:
              `${Math.max(daily.length * 50, 280)}px`,
          }}
        >

          {daily.map((day) => {
            const active =
              selected?.date === day.date;

            const height =
              (day.total / maxValue) * 150;

            return (
              <button
                type="button"
                key={day.date}
                aria-pressed={active}
                aria-label={`${formatDate(day.date, true)}: ${day.total} address requests`}
                title={`${formatDate(day.date, true)} — ${day.total} requests`}
                onClick={() =>
                  setSelectedDate(day.date)
                }
                className="group flex min-w-0 flex-col items-center rounded-lg px-1 py-2 outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
              >

                <div className="flex h-[190px] w-full flex-col items-center justify-end border-b border-slate-200 pb-1">

                  <span className="mb-2 text-[10px] font-semibold text-slate-600">

                    {formatNumber(day.total)}

                  </span>

                  <div
                    className={`w-3/4 max-w-10 rounded-t-md transition-all ${
                      day.total === 0
                        ? "bg-slate-200"
                        : active
                          ? "bg-emerald-800"
                          : "bg-emerald-400 group-hover:bg-emerald-600"
                    }`}

                    style={{
                      height:
                        `${Math.max(height, 2)}px`,
                    }}
                  />

                </div>

                <span
                  className={`mt-3 whitespace-nowrap text-[10px] ${
                    active
                      ? "font-bold text-emerald-700"
                      : "text-slate-500"
                  }`}
                >
                  {formatDate(day.date)}
                </span>

              </button>
            );
          })}
        </div>
      </div>

      {daily.length > 7 && (
        <p className="text-center text-xs text-slate-400">
          Scroll horizontally to view more dates.
        </p>
      )}

      {/* Selected day details */}

      {selected && (
        <div className="mt-5 rounded-xl border border-emerald-100 bg-emerald-50/50 p-4">

          <p className="mb-4 font-semibold text-slate-900">
            {formatDate(selected.date, true)}
            {" — "}
            Daily Breakdown
          </p>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">

            {[
              ["Total", selected.total],
              ["Confirmed", selected.confirmed],
              ["Review Requested", selected.reviewRequested],
              ["Awaiting Decision", selected.awaitingDecision],
              ["No Confident Match", selected.noConfidentMatch],
              ["Saved", selected.saved],
            ].map(([label, value]) => (
              <div key={label}>

                <p className="text-xs text-slate-500">
                  {label}
                </p>

                <p className="mt-1 text-xl font-bold text-slate-900">
                  {formatNumber(Number(value))}
                </p>

              </div>
            ))}

          </div>
        </div>
      )}

    </section>
  );
}

// =====================================
// STATUS DISTRIBUTION DONUT CHART
// =====================================

function StatusChart({
  summary,
}: {
  summary: AnalyticsSummary;
}) {
  const total = summary.total;

  const percentage = (count: number) =>
    total === 0
      ? 0
      : (count / total) * 100;

  const confirmedPercentage =
    percentage(summary.confirmed);

  const reviewPercentage =
    percentage(summary.reviewRequested);

  const reviewEnd =
    confirmedPercentage + reviewPercentage;

  const gradient =
    total === 0
      ? "#e2e8f0"
      : `conic-gradient(
          #059669 0% ${confirmedPercentage}%,
          #d97706 ${confirmedPercentage}% ${reviewEnd}%,
          #94a3b8 ${reviewEnd}% 100%
        )`;

  const sections = [
    {
      label: "Confirmed",
      count: summary.confirmed,
      color: "#059669",
    },
    {
      label: "Review Requested",
      count: summary.reviewRequested,
      color: "#d97706",
    },
    {
      label: "Awaiting Decision",
      count: summary.awaitingDecision,
      color: "#94a3b8",
    },
  ];

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">

      <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">

        <PieChart
          size={21}
          className="text-emerald-700"
        />

        Status Distribution

      </h2>

      <p className="mt-2 text-xs text-slate-500">
        Current status of address requests in the selected period.
      </p>

      <div className="my-7 flex justify-center">

        <div
          role="img"
          aria-label={`Status distribution: ${summary.confirmed} confirmed, ${summary.reviewRequested} review requested, ${summary.awaitingDecision} awaiting decision`}
          className="flex h-48 w-48 shrink-0 items-center justify-center rounded-full sm:h-52 sm:w-52"
          style={{
            background: gradient,
          }}
        >

          <div className="flex h-[72%] w-[72%] flex-col items-center justify-center rounded-full bg-white">

            <p className="text-3xl font-bold text-slate-900">
              {formatNumber(total)}
            </p>

            <p className="mt-1 text-xs text-slate-500">
              Total Addresses
            </p>

          </div>
        </div>
      </div>

      <div className="space-y-4">

        {sections.map((section) => (
          <div key={section.label}>

            <div className="flex items-center justify-between gap-2 text-sm">

              <div className="flex items-center gap-2">

                <span
                  className="h-3 w-3 shrink-0 rounded-full"

                  style={{
                    backgroundColor: section.color,
                  }}
                />

                <span className="text-slate-600">
                  {section.label}
                </span>

              </div>

              <span className="font-semibold text-slate-900">
                {formatNumber(section.count)}
                {" "}
                ({percentage(section.count).toFixed(1)}%)
              </span>

            </div>

            <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">

              <div
                className="h-full rounded-full"

                style={{
                  width:
                    `${percentage(section.count)}%`,

                  backgroundColor:
                    section.color,
                }}
              />

            </div>
          </div>
        ))}

      </div>

      <p className="mt-5 border-t border-slate-100 pt-4 text-xs leading-relaxed text-slate-500">
        Saved addresses are a separate bookmark metric.
        No Confident Match is included within Awaiting
        Decision, not counted as an additional status.
      </p>

    </section>
  );
}

// =====================================
// CONFIRMATION RATE CARD
// =====================================

function ConfirmationRate({
  summary,
}: {
  summary: AnalyticsSummary;
}) {
  const rate = summary.confirmationRate;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">

      <div className="flex flex-wrap items-center justify-between gap-3">

        <div>
          <h2 className="text-lg font-bold text-slate-900">
            Confirmation Rate
          </h2>

          <p className="mt-2 text-sm text-slate-500">
            How many address requests have been confirmed?
          </p>
        </div>

        <span className="text-4xl font-bold text-emerald-700">
          {rate}%
        </span>

      </div>

      <div
        role="progressbar"
        aria-label="Merchant confirmation rate"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={rate}
        className="mt-6 h-3 overflow-hidden rounded-full bg-slate-100"
      >

        <div
          className="h-full rounded-full bg-emerald-600 transition-all duration-500"
          style={{
            width:
              `${Math.min(100, Math.max(0, rate))}%`,
          }}
        />

      </div>

      <div className="mt-3 flex justify-between gap-2 text-xs text-slate-500">

        <span>
          Confirmed: {formatNumber(summary.confirmed)}
        </span>

        <span>
          Total: {formatNumber(summary.total)}
        </span>

      </div>

      <p className="mt-4 rounded-xl bg-slate-50 p-4 text-xs leading-relaxed text-slate-600">
        {summary.total === 0
          ? "There are no address requests in this period, so a confirmation rate cannot be meaningfully calculated."
          : "This rate represents merchant confirmation activity, not independently verified address accuracy."}
      </p>

    </section>
  );
}
// =====================================
// MAIN MERCHANT ANALYTICS DASHBOARD
// =====================================

export default function MerchantAnalytics() {
  const { refreshUser } = useAuth();

  const [data, setData] =
    useState<AnalyticsResponse | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  const [sessionExpired, setSessionExpired] =
    useState(false);

  const [period, setPeriod] =
    useState<AnalyticsPeriod>("7");

  const [customOpen, setCustomOpen] =
    useState(false);

  const [draftRange, setDraftRange] =
    useState<AnalyticsDateFilter>(
      () => getPresetRange(7)
    );

  const [rangeError, setRangeError] =
    useState("");

  const [request, setRequest] =
    useState<{
      range?: AnalyticsDateFilter;
    }>({});

  // =================================
  // LOAD ANALYTICS FROM BACKEND
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

        if (
          error instanceof ApiError &&
          error.status === 401
        ) {
          setSessionExpired(true);

          setError(
            "Your session has expired. Please sign in again."
          );

        } else {
          setError(
            error instanceof Error
              ? error.message
              : "Unable to load analytics."
          );
        }

        setData(null);
      })

      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [request]);

  // =================================
  // START A NEW ANALYTICS REQUEST
  // =================================

  function startRequest(
    range?: AnalyticsDateFilter
  ) {
    setLoading(true);

    setError("");

    setData(null);

    setSessionExpired(false);

    setRequest({ range });
  }

  // =================================
  // PRESET DATE FILTERS
  // =================================

  function selectPreset(
    selected: "7" | "30" | "90"
  ) {
    if (loading || sessionExpired) return;

    const range = getPresetRange(
      Number(selected)
    );

    setPeriod(selected);

    setDraftRange(range);

    setCustomOpen(false);

    setRangeError("");

    // Seven-day default comes directly
    // from the server's Bangladesh date.
    startRequest(
      selected === "7"
        ? undefined
        : range
    );
  }

  // =================================
  // CUSTOM DATE RANGE
  // =================================

  function openCustomRange() {
    if (loading || sessionExpired) return;

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

    if (loading || sessionExpired) return;

    const validation =
      validateRange(draftRange);

    if (validation) {
      setRangeError(validation);
      return;
    }

    setRangeError("");

    setPeriod("custom");

    startRequest({
      from: draftRange.from,
      to: draftRange.to,
    });
  }

  // =================================
  // REFRESH CURRENT ANALYTICS
  // =================================

  function refreshAnalytics() {
    if (loading || sessionExpired) return;

    if (period === "custom") {
      startRequest(request.range);
      return;
    }

    if (period === "7") {
      startRequest();
      return;
    }

    startRequest(
      getPresetRange(Number(period))
    );
  }

  const filters = [
    { value: "7", label: "Last 7 Days" },
    { value: "30", label: "Last 30 Days" },
    { value: "90", label: "Last 90 Days" },
    { value: "custom", label: "Custom Range" },
  ] as const;

  const activeFilter =
    customOpen ? "custom" : period;

  const today = getDhakaToday();

  return (
    <div className="space-y-7">

      {/* =================================
          PAGE HEADER
      ================================= */}

      <section className="flex flex-wrap items-start justify-between gap-4">

        <div>

          <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">

            <BarChart3 size={16} />

            Merchant Intelligence

          </div>

          <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            Merchant Analytics
          </h1>

          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-500 sm:text-base">
            Monitor your address resolution activity,
            merchant confirmations and saved addresses.
          </p>

        </div>

        <Link
          href="/dashboard/resolve/"
          className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-800"
        >

          <ScanSearch size={19} />

          New Address

        </Link>

      </section>

      {/* =================================
          DATE FILTER PANEL
      ================================= */}

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
                All dates use Bangladesh time (UTC+6).
              </p>

            </div>

          </div>

          <button
            type="button"
            disabled={loading || sessionExpired}
            onClick={refreshAnalytics}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
          >

            <RefreshCw
              size={17}
              className={
                loading ? "animate-spin" : ""
              }
            />

            Refresh

          </button>

        </div>

        {/* Date preset buttons */}

        <div className="flex flex-wrap gap-2">

          {filters.map((filter) => {
            const active =
              activeFilter === filter.value;

            return (
              <button
                type="button"
                key={filter.value}
                aria-pressed={active}
                disabled={loading || sessionExpired}

                onClick={() => {
                  if (filter.value === "custom") {
                    openCustomRange();
                  } else {
                    selectPreset(filter.value);
                  }
                }}

                className={`rounded-xl px-4 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                  active
                    ? "bg-emerald-700 text-white"
                    : "border border-slate-200 bg-white text-slate-600 hover:border-emerald-300 hover:bg-emerald-50"
                }`}
              >

                {filter.label}

              </button>
            );
          })}

        </div>

        {/* Custom date form */}

        {customOpen && (
          <form
            onSubmit={applyCustomRange}
            className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-4"
          >

            <div className="grid gap-4 sm:grid-cols-2">

              <div>

                <label
                  htmlFor="analytics-from"
                  className="mb-2 block text-sm font-semibold text-slate-700"
                >
                  Start Date
                </label>

                <input
                  id="analytics-from"
                  type="date"
                  required
                  min={MIN_DATE}
                  max={today}
                  value={draftRange.from}
                  disabled={loading || sessionExpired}

                  onChange={(event) => {
                    setRangeError("");

                    setDraftRange((previous) => ({
                      ...previous,
                      from: event.target.value,
                    }));
                  }}

                  className="w-full rounded-xl border border-slate-300 bg-white p-3 text-sm text-slate-800 outline-none focus:border-emerald-500"
                />

              </div>

              <div>

                <label
                  htmlFor="analytics-to"
                  className="mb-2 block text-sm font-semibold text-slate-700"
                >
                  End Date
                </label>

                <input
                  id="analytics-to"
                  type="date"
                  required
                  min={MIN_DATE}
                  max={today}
                  value={draftRange.to}
                  disabled={loading || sessionExpired}

                  onChange={(event) => {
                    setRangeError("");

                    setDraftRange((previous) => ({
                      ...previous,
                      to: event.target.value,
                    }));
                  }}

                  className="w-full rounded-xl border border-slate-300 bg-white p-3 text-sm text-slate-800 outline-none focus:border-emerald-500"
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

            <div className="flex flex-wrap items-center justify-between gap-3">

              <p className="text-xs text-slate-500">
                Maximum reporting period: 90 days.
              </p>

              <button
                type="submit"
                disabled={loading || sessionExpired}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
              >

                <CalendarDays size={17} />

                Apply Date Range

              </button>

            </div>

          </form>
        )}

        {/* Actual applied date range */}

        {data && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-4">

            <div className="flex items-center gap-2 text-sm font-medium text-slate-700">

              <CalendarDays
                size={17}
                className="text-emerald-600"
              />

              {formatDate(data.range.from, true)}
              {" — "}
              {formatDate(data.range.to, true)}

            </div>

            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">

              {data.range.days} day(s)

            </span>

          </div>
        )}

      </section>

      {/* =================================
          ERROR STATE
      ================================= */}

      {error && (
        <div
          role="alert"
          className="rounded-2xl border border-red-200 bg-red-50 p-5"
        >

          <div className="flex items-start gap-3">

            <AlertCircle
              size={24}
              className="shrink-0 text-red-600"
            />

            <div>

              <h3 className="font-bold text-red-900">
                Unable to Load Analytics
              </h3>

              <p className="mt-2 text-sm text-red-700">
                {error}
              </p>

            </div>

          </div>

          <button
            type="button"

            onClick={() => {
              if (sessionExpired) {
                void refreshUser();
              } else {
                refreshAnalytics();
              }
            }}

            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-red-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-800"
          >

            <RefreshCw size={17} />

            {sessionExpired
              ? "Refresh Session"
              : "Try Again"}

          </button>

        </div>
      )}

      {/* =================================
          LOADING STATE
      ================================= */}

      {loading && (
        <section
          role="status"
          aria-label="Loading analytics"
          className="space-y-5"
        >

          <div className="flex items-center justify-center gap-3 rounded-xl border border-emerald-100 bg-emerald-50 p-4 text-sm font-medium text-emerald-700">

            <Loader2
              size={22}
              className="animate-spin"
            />

            Loading your analytics...

          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">

            {Array.from({ length: 7 }).map(
              (_, index) => (
                <div
                  key={index}
                  aria-hidden="true"
                  className="animate-pulse space-y-4 rounded-2xl border border-slate-200 bg-white p-5"
                >

                  <div className="h-12 w-12 rounded-xl bg-slate-200" />

                  <div className="h-3 w-3/4 rounded bg-slate-200" />

                  <div className="h-9 w-1/2 rounded bg-slate-200" />

                  <div className="h-3 w-full rounded bg-slate-100" />

                </div>
              )
            )}

          </div>

        </section>
      )}

      {/* =================================
          LIVE ANALYTICS RESULTS
      ================================= */}

      {!loading && data && !sessionExpired && (
        <>

          <StatisticsCards
            summary={data.summary}
          />

          {/* Empty analytics notice */}

          {data.summary.total === 0 && (
            <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">

              <BarChart3
                size={40}
                className="mx-auto text-slate-400"
              />

              <h2 className="mt-4 text-lg font-bold text-slate-900">
                No Address Activity
              </h2>

              <p className="mt-2 text-sm text-slate-500">
                There are no existing address requests
                in the selected reporting period.
              </p>

              <Link
                href="/dashboard/resolve/"
                className="mt-5 inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-5 py-3 text-sm font-semibold text-white"
              >

                <ScanSearch size={18} />

                Resolve an Address

              </Link>

            </section>
          )}

          {/* Charts */}

          <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">

            <ActivityChart
              key={`${data.range.from}:${data.range.to}:${data.generatedAt}`}
              daily={data.daily}
            />

            <StatusChart
              summary={data.summary}
            />

          </div>

          <ConfirmationRate
            summary={data.summary}
          />

          {/* Report metadata */}

          <section className="rounded-2xl border border-slate-200 bg-white p-5">

            <h2 className="font-bold text-slate-900">
              Report Information
            </h2>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">

              <div>

                <p className="text-xs text-slate-500">
                  Generated At
                </p>

                <p className="mt-1 text-sm font-semibold text-slate-800">
                  {formatTimestamp(data.generatedAt)}
                </p>

              </div>

              <div>

                <p className="text-xs text-slate-500">
                  Reporting Time Zone
                </p>

                <p className="mt-1 text-sm font-semibold text-slate-800">
                  {data.range.timeZone}
                </p>

              </div>

            </div>

            <p className="mt-4 border-t border-slate-100 pt-4 text-xs leading-relaxed text-slate-500">
              Statistics represent existing address records,
              grouped by their original creation date.
              Deleted requests are excluded.
              Edited requests remain within their original
              creation date.
            </p>

          </section>

        </>
      )}

      {/* =================================
          PRIVACY NOTICE
      ================================= */}

      <div className="flex items-start gap-3 rounded-xl border border-emerald-100 bg-emerald-50 p-4">

        <ShieldCheck
          size={21}
          className="shrink-0 text-emerald-700"
        />

        <p className="text-xs leading-relaxed text-emerald-800">
          Analytics are calculated from your own address
          request metadata. Private address content is
          not decrypted or returned by the analytics API.
        </p>

      </div>

    </div>
  );
}