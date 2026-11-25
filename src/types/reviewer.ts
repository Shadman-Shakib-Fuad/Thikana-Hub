// =====================================
// REVIEW STATUS
// =====================================

export type ReviewStatus =
  | "pending"
  | "resolved"
  | "escalated";

export type MerchantDisposition =
  | "accepted"
  | "re_review_requested";

// =====================================
// STATISTICS
// =====================================

export interface ReviewerStatistics {
  pending: number;
  resolved: number;
  escalated: number;
  merchantAccepted: number;
}

export interface ReviewerStatisticsResponse {
  success: boolean;
  summary: ReviewerStatistics;
  generatedAt: string;
}

// =====================================
// REVIEW QUEUE
// =====================================

export interface ReviewQueueItem {
  jobId: string;
  status: string;
  decision: string | null;
  revision: number;
  reviewStatus: ReviewStatus;
  assignedAt: string;
  decidedAt: string | null;
  merchantDisposition: MerchantDisposition | null;
  merchantDecidedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ReviewerQueueResponse {
  success: boolean;

  items: ReviewQueueItem[];

  pagination: {
    limit: number;
    hasMore: boolean;
    nextCursor: string | null;
  };
}

export interface ReviewerQueueOptions {
  status?: ReviewStatus;
  limit?: number;
  cursor?: string | null;
}

// =====================================
// LOCALITY DATA
// =====================================

export interface ReviewLocality {
  nameEn: string;
  nameBn?: string;
  areaEn?: string;
  areaBn?: string;
  districtEn?: string;
  districtBn?: string;
  divisionEn?: string;
  divisionBn?: string;
}

export interface ReviewCandidate {
  localityId: string;
  locality: ReviewLocality;
  score?: number | null;
  matchType?: string;
}

// =====================================
// REVIEW DETAILS
// =====================================

export interface ReviewerDetailResponse {
  success: boolean;
  jobId: string;
  originalAddress: string;
  candidates: ReviewCandidate[];
  ambiguous: boolean;
  status: string;
  decision: string;
  revision: number;
  reviewStatus: "pending";
  assignedAt: string;
  createdAt: string;
  updatedAt: string;
}

// =====================================
// APPROVED LOCALITY LIST
// =====================================

export interface ApprovedReviewLocality {
  localityId: string;
  locality: ReviewLocality;
}

export interface ReviewLocalitiesResponse {
  success: boolean;
  items: ApprovedReviewLocality[];
  total: number;
}

// =====================================
// REVIEW DECISION INPUT
// =====================================

export type ReviewerDecisionInput =
  | {
      decision: "resolved";
      localityId: string;
      note: string;
      revision: number;
    }
  | {
      decision: "escalated";
      note: string;
      revision: number;
    };

// =====================================
// REVIEW DECISION RESPONSE
// =====================================

export interface ReviewerDecisionResponse {
  success: boolean;
  jobId: string;
  reviewStatus: "resolved" | "escalated";
  revision: number;
  decidedAt: string;
  message: string;
}