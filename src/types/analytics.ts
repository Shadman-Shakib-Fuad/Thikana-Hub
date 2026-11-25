export interface AnalyticsMetrics {
  total: number;
  confirmed: number;
  reviewRequested: number;
  awaitingDecision: number;
  noConfidentMatch: number;
  saved: number;
}

export interface AnalyticsSummary
  extends AnalyticsMetrics {
  confirmationRate: number;
}

export interface DailyAnalytics
  extends AnalyticsMetrics {
  date: string;
}

export interface AnalyticsRange {
  from: string;
  to: string;
  days: number;
  timeZone: string;
}

export interface AnalyticsDateFilter {
  from: string;
  to: string;
}

export interface AnalyticsResponse {
  success: boolean;
  range: AnalyticsRange;
  summary: AnalyticsSummary;
  daily: DailyAnalytics[];
  generatedAt: string;
}

export type AnalyticsPeriod =
  | "7"
  | "30"
  | "90"
  | "custom";