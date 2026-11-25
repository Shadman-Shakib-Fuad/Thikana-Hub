import { apiRequest } from "@/services/api";

import type {
  ReviewerStatisticsResponse,
  ReviewerQueueResponse,
  ReviewerDetailResponse,
  ReviewerQueueOptions,
  ReviewLocalitiesResponse,
  ReviewerDecisionInput,
  ReviewerDecisionResponse,
} from "@/types/reviewer";

export const reviewerService = {
  // =================================
  // STATISTICS
  // =================================

  getStatistics() {
    return apiRequest<ReviewerStatisticsResponse>(
      "/p14/reviewer/statistics",
      { method: "GET" }
    );
  },

  // =================================
  // REVIEW QUEUE
  // =================================

  getQueue(options: ReviewerQueueOptions = {}) {
    const params = new URLSearchParams();

    params.set(
      "status",
      options.status ?? "pending"
    );

    params.set(
      "limit",
      String(options.limit ?? 10)
    );

    if (options.cursor) {
      params.set("cursor", options.cursor);
    }

    return apiRequest<ReviewerQueueResponse>(
      `/p14/reviewer/queue?${params.toString()}`,
      { method: "GET" }
    );
  },

  // =================================
  // ASSIGNED REVIEW DETAILS
  // =================================

  getDetails(jobId: string) {
    return apiRequest<ReviewerDetailResponse>(
      `/p14/reviewer/queue/${encodeURIComponent(jobId)}`,
      { method: "GET" }
    );
  },

  // =================================
  // APPROVED LOCALITIES
  // =================================

  getLocalities(jobId: string) {
    return apiRequest<ReviewLocalitiesResponse>(
      `/p14/reviewer/queue/${encodeURIComponent(jobId)}/localities`,
      { method: "GET" }
    );
  },

  // =================================
  // SUBMIT REVIEW DECISION
  // =================================

  submitDecision(
    jobId: string,
    assignedAt: string,
    input: ReviewerDecisionInput
  ) {
    return apiRequest<ReviewerDecisionResponse>(
      `/p14/reviewer/queue/${encodeURIComponent(jobId)}/decision`,
      {
        method: "POST",

        headers: {
          "X-Review-Assignment": assignedAt,
        },

        body: input,
      }
    );
  },
};