import type { ReviewLocality } from "@/types/reviewer";

// =====================================
// REVIEW STATUS
// =====================================

export type MerchantReviewStatus =
  | "unassigned"
  | "pending"
  | "resolved"
  | "escalated"
  | "accepted";

// =====================================
// MANUAL REVIEW RECOMMENDATION
// =====================================

export interface ReviewRecommendation {
  localityId: string;
  locality: ReviewLocality;
}

export interface MerchantReviewOutcome {
  recommendation: ReviewRecommendation | null;
  note: string;
  decidedAt: string;

  merchantDisposition:
    | "accepted"
    | "re_review_requested"
    | null;
}

// =====================================
// REVIEW RESPONSE
// =====================================

export interface MerchantReviewResponse {
  success: boolean;
  jobId: string;
  revision: number;
  addressStatus: string;
  reviewStatus: MerchantReviewStatus;
  reviewVersion: string | null;
  outcome: MerchantReviewOutcome | null;
  canAccept: boolean;
  canRequestReReview: boolean;
}

// =====================================
// MERCHANT DECISION
// =====================================

export type MerchantReviewDecision =
  | "accept"
  | "request_re_review";

export interface MerchantReviewDecisionInput {
  decision: MerchantReviewDecision;
  revision: number;
  reviewVersion: string;
}

export interface MerchantReviewDecisionResponse {
  success: boolean;
  jobId: string;
  revision: number;
  reviewStatus: MerchantReviewStatus;
  decision: string;
  status: string;
  selectedCandidate: ManualReviewCandidate | null;
  saved: boolean;
  savedAt: string | null;
  requiresConfirmation: boolean;
  updatedAt: string;
  message: string;
}

// =====================================
// MANUAL REVIEW CANDIDATE
// =====================================

export interface ManualReviewCandidate
  extends ReviewRecommendation {
  matchType: "manual_review";
  score: null;
  reasons: string[];
  source: string;
}

// =====================================
// HISTORY RECORDS
// =====================================

export interface MerchantReviewHistoryItem {
  jobId: string;
  originalAddress: string;
  status: string;
  decision: string | null;
  revision: number;
  saved: boolean;
  savedAt: string | null;

  selectedCandidate: {
    localityId: string;
    locality: ReviewLocality;
    matchType?: string;
    score?: number | null;
  } | null;

  createdAt: string;
  updatedAt: string;
}

export interface MerchantReviewHistoryResponse {
  success: boolean;
  items: MerchantReviewHistoryItem[];

  pagination: {
    limit: number;
    hasMore: boolean;
    nextCursor: string | null;
  };
}

// =====================================
// ADDRESS DETAILS AND BOOKMARK
// =====================================

export interface MerchantReviewJobResponse {
  success: boolean;
  jobId: string;
  originalAddress: string;
  revision: number;
  status: string;
  decision: string | null;
  saved: boolean;
  savedAt: string | null;
}

export interface MerchantReviewSaveResponse {
  success: boolean;
  jobId: string;
  revision: number;
  saved: boolean;
  savedAt: string | null;
  message: string;
}