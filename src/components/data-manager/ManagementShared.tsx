"use client";

import {
  useEffect,
  useState,
  useId,
  cloneElement,
  type ReactElement,
  type ReactNode,
} from "react";

import {
  AlertCircle,
  CheckCircle2,
  LoaderCircle,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

import {
  apiRequest,
  ApiError,
} from "@/services/api";

import type {
  Pagination,
} from "@/types/data-manager-management";

import type {
  ProposalStatus,
} from "@/types/data-manager";

export const BASE = "/p14/data-manager";

export const inputClass =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 disabled:bg-slate-100";

export const primaryClass =
  "inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50";

export const secondaryClass =
  "inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50";

export const panelClass =
  "rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6";

export function errorMessage(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 401) {
      return "Your session has expired. Please sign in again.";
    }

    if (error.status === 403) {
      return "You do not have permission to perform this action.";
    }

    if (error.status === 429) {
      return "Too many requests. Please try again later.";
    }

    return error.message;
  }

  return error instanceof Error
    ? error.message
    : "Something went wrong. Please try again.";
}

export function formatDate(value?: string | null) {
  if (!value) return "Not available";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Not available";
  }

  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Dhaka",
  }).format(date);
}

// Ignore outdated network responses after
// search, pagination, refresh or navigation.

export function useRemote<T>(
  endpoint: string | null,
  revision = 0
) {
  const requestKey = JSON.stringify([
    endpoint,
    revision,
  ]);

  const [result, setResult] = useState<{
    key: string;
    data: T | null;
    error: string;
  } | null>(null);

  useEffect(() => {
    if (!endpoint) return;

    let cancelled = false;

    apiRequest<T>(endpoint, { method: "GET" })
      .then(data => {
        if (!cancelled) {
          setResult({
            key: requestKey,
            data,
            error: "",
          });
        }
      })
      .catch(error => {
        if (!cancelled) {
          setResult({
            key: requestKey,
            data: null,
            error: errorMessage(error),
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [endpoint, requestKey]);

  const current = result?.key === requestKey
    ? result
    : null;

  return {
    data: current?.data ?? null,
    error: current?.error ?? "",
    loading: Boolean(endpoint && !current),
  };
}

export function PageHeading({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <p className="mb-2 text-xs font-bold uppercase tracking-wider text-emerald-700">
          Dataset management
        </p>

        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          {title}
        </h1>

        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-500">
          {description}
        </p>
      </div>

      {children}
    </header>
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactElement<{ id?: string }>;
}) {
  const generatedId = useId();

  const id = children.props.id ?? generatedId;

  return (
    <div className="space-y-2">
      <label
        htmlFor={id}
        className="block text-sm font-semibold text-slate-700"
      >
        {label}
      </label>

      {cloneElement(children, { id })}
    </div>
  );
}

export function Notice({
  message,
  success = false,
}: {
  message: string;
  success?: boolean;
}) {
  if (!message) return null;

  const Icon = success ? CheckCircle2 : AlertCircle;

  return (
    <div
      role={success ? "status" : "alert"}
      className={[
        "flex items-start gap-3 rounded-xl border p-4 text-sm",
        success
          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
          : "border-red-200 bg-red-50 text-red-800",
      ].join(" ")}
    >
      <Icon className="mt-0.5 h-5 w-5 shrink-0" />
      <span className="break-words">{message}</span>
    </div>
  );
}

export function Loading() {
  return (
    <div
      role="status"
      className="flex items-center justify-center gap-3 py-12 text-sm text-slate-500"
    >
      <LoaderCircle className="h-5 w-5 animate-spin text-emerald-700" />
      Loading data...
    </div>
  );
}

export function Status({
  value,
}: {
  value: ProposalStatus;
}) {
  const styles = {
    pending: "bg-amber-50 text-amber-700",
    approved: "bg-emerald-50 text-emerald-700",
    rejected: "bg-red-50 text-red-700",
  };

  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold capitalize ${styles[value] ?? "bg-slate-100 text-slate-600"}`}>
      {value}
    </span>
  );
}

export function Pager({
  pagination,
  page,
  onPrevious,
  onNext,
  disabled = false,
}: {
  pagination?: Pagination;
  page: number;
  onPrevious: () => void;
  onNext: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
      <span className="text-sm text-slate-500">
        Page {page}
      </span>

      <div className="flex gap-2">
        <button
          type="button"
          className={secondaryClass}
          disabled={disabled || page <= 1}
          onClick={onPrevious}
        >
          <ChevronLeft className="h-4 w-4" />
          Previous
        </button>

        <button
          type="button"
          className={secondaryClass}
          disabled={
            disabled ||
            !pagination?.hasMore ||
            !pagination.nextCursor
          }
          onClick={onNext}
        >
          Next
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
