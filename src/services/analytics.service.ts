import { apiRequest } from "@/services/api";

import type {
  AnalyticsResponse,
  AnalyticsDateFilter,
} from "@/types/analytics";

export const analyticsService = {
  getAnalytics(range?: AnalyticsDateFilter) {
    const params = new URLSearchParams();

    if (range) {
      params.set("from", range.from);
      params.set("to", range.to);
    }

    const query = params.toString();

    const endpoint = query
      ? `/p14/analytics?${query}`
      : "/p14/analytics";

    return apiRequest<AnalyticsResponse>(
      endpoint,
      {
        method: "GET",
      }
    );
  },
};