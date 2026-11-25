// =====================================
// ADDRESS STATUS
// =====================================

export type AddressStatus =
  | "needs_review"
  | "no_confident_match"
  | "confirmed";

export type AddressDecision =
  | "confirmed"
  | "review_requested";

// =====================================
// ALGORITHM MATCH TYPES
// =====================================

export type MatchType =
  | "exact"
  | "fuzzy"
  | "landmark";

// =====================================
// LOCALITY
// =====================================

export interface Locality {
  nameEn: string;
  nameBn: string;

  areaEn: string;
  areaBn: string;

  districtEn: string;
  districtBn: string;

  divisionEn: string;
  divisionBn: string;
}

// =====================================
// ALGORITHM-GENERATED CANDIDATE
// =====================================

export interface AddressCandidate {
  localityId: string;
  locality: Locality;

  score: number;

  matchType: MatchType;

  reasons: string[];

  source?: string | null;
}

// =====================================
// HUMAN REVIEW CANDIDATE
// =====================================

export interface ManualReviewCandidate {
  localityId: string;
  locality: Locality;

  score: null;

  matchType: "manual_review";

  reasons: string[];

  source?: string | null;
}

// =====================================
// SELECTED ADDRESS CANDIDATE
// =====================================

export type SelectedAddressCandidate =
  | AddressCandidate
  | ManualReviewCandidate;

// =====================================
// MANUAL REVIEW TYPE GUARD
// =====================================

export function isManualReviewCandidate(
  candidate?: SelectedAddressCandidate | null
): candidate is ManualReviewCandidate {
  return candidate?.matchType === "manual_review";
}

// =====================================
// ADDRESS RESOLUTION INPUT
// =====================================

export interface ResolveAddressData {
  address: string;
}

// =====================================
// ADDRESS RESOLUTION RESPONSE
// =====================================

export interface AddressResolutionResponse {
  success: boolean;

  jobId: string;

  status: AddressStatus;

  message: string;

  requiresConfirmation: boolean;

  ambiguous: boolean;

  candidates: AddressCandidate[];

  createdAt: string;

  decision?: AddressDecision | null;

  selectedCandidate?: SelectedAddressCandidate | null;

  updatedAt?: string;

  revision?: number;

  saved?: boolean;

  savedAt?: string | null;
}

// =====================================
// ADDRESS JOB DETAILS
// =====================================

export interface AddressJobResponse {
  success: boolean;

  jobId: string;

  originalAddress: string;

  status: AddressStatus;

  decision: AddressDecision | null;

  selectedCandidate: SelectedAddressCandidate | null;

  candidates: AddressCandidate[];

  ambiguous: boolean;

  requiresConfirmation: boolean;

  revision: number;

  saved: boolean;

  savedAt: string | null;

  createdAt: string;

  updatedAt: string;

  message?: string;
}

// =====================================
// ADDRESS FEEDBACK INPUT
// =====================================

export type AddressFeedbackData =
  | {
      jobId: string;
      revision: number;
      decision: "confirmed";
      localityId: string;
    }
  | {
      jobId: string;
      revision: number;
      decision: "no_correct_match";
    };

// =====================================
// ADDRESS FEEDBACK RESPONSE
// =====================================

export interface AddressFeedbackResponse {
  success: boolean;

  jobId: string;

  status: AddressStatus;

  decision: AddressDecision;

  revision: number;

  selectedCandidate: SelectedAddressCandidate | null;

  requiresConfirmation: boolean;

  message: string;

  updatedAt: string;
}

// =====================================
// ADDRESS HISTORY ITEM
// =====================================

export interface AddressHistoryItem {
  jobId: string;

  originalAddress: string;

  status: AddressStatus;

  decision: AddressDecision | null;

  candidateCount: number;

  selectedCandidate: SelectedAddressCandidate | null;

  requiresConfirmation: boolean;

  revision: number;

  saved: boolean;

  savedAt: string | null;

  createdAt: string;

  updatedAt: string;
}

// =====================================
// ADDRESS HISTORY RESPONSE
// =====================================

export interface AddressHistoryResponse {
  success: boolean;

  items: AddressHistoryItem[];

  pagination: {
    limit: number;
    hasMore: boolean;
    nextCursor: string | null;
  };
}

// =====================================
// SAVE ADDRESS INPUT
// =====================================

export interface SaveAddressData {
  saved: boolean;

  revision: number;
}

// =====================================
// SAVE ADDRESS RESPONSE
// =====================================

export interface SaveAddressResponse {
  success: boolean;

  jobId: string;

  saved: boolean;

  savedAt: string | null;

  revision: number;

  message: string;
}

// =====================================
// EDIT ADDRESS INPUT
// =====================================

export interface EditAddressData {
  address: string;

  revision: number;
}

// =====================================
// DELETE ADDRESS INPUT
// =====================================

export interface DeleteAddressData {
  revision: number;
}

// =====================================
// DELETE ADDRESS RESPONSE
// =====================================

export interface DeleteAddressResponse {
  success: boolean;

  jobId: string;

  deleted: boolean;

  message: string;
}

// =====================================
// ADDRESS STATUS LABEL
// =====================================

export function getAddressStatusLabel(
  status: AddressStatus,
  decision?: AddressDecision | null
) {
  if (decision === "review_requested") {
    return "Review Requested";
  }

  if (status === "confirmed") {
    return "Confirmed by Merchant";
  }

  if (status === "no_confident_match") {
    return "No Confident Match";
  }

  return "Awaiting Decision";
}