import { apiRequest } from "@/services/api";

import type {
  MerchantReviewResponse,
  MerchantReviewDecisionInput,
  MerchantReviewDecisionResponse,
  MerchantReviewHistoryResponse,
  MerchantReviewJobResponse,
  MerchantReviewSaveResponse,
} from "@/types/merchant-review";

// =====================================
// MERCHANT REVIEW SERVICE
// =====================================

export const merchantReviewService = {
  getHistory(cursor: string | null = null) {
    const params = new URLSearchParams({
      limit: "20",
    });

    if (cursor) {
      params.set("cursor", cursor);
    }

    return apiRequest<MerchantReviewHistoryResponse>(
      `/p14/address-history?${params.toString()}`,
      {
        method: "GET",
      }
    );
  },

  // =================================
  // GET REVIEW RESULT
  // =================================

  getReview(jobId: string) {
    return apiRequest<MerchantReviewResponse>(
      `/p14/merchant-reviews/${encodeURIComponent(jobId)}`,
      {
        method: "GET",
      }
    );
  },

  // =================================
  // GET CURRENT ADDRESS DETAILS
  // =================================

  getJob(jobId: string) {
    return apiRequest<MerchantReviewJobResponse>(
      `/jobs/${encodeURIComponent(jobId)}`,
      {
        method: "GET",
      }
    );
  },

  // =================================
  // ACCEPT OR REQUEST RE-REVIEW
  // =================================

  submitDecision(
    jobId: string,
    input: MerchantReviewDecisionInput
  ) {
    return apiRequest<MerchantReviewDecisionResponse>(
      `/p14/merchant-reviews/${encodeURIComponent(jobId)}/decision`,
      {
        method: "POST",
        body: input,
      }
    );
  },

  // =================================
  // SAVE OR UNSAVE ACCEPTED ADDRESS
  // =================================

  setSaved(
    jobId: string,
    revision: number,
    saved: boolean
  ) {
    return apiRequest<MerchantReviewSaveResponse>(
      `/p14/saved-addresses/${encodeURIComponent(jobId)}`,
      {
        method: "PATCH",

        body: {
          revision,
          saved,
        },
      }
    );
  },
};