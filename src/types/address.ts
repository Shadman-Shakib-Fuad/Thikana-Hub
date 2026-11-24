export type AddressStatus =
  | "needs_review"
  | "no_confident_match"
  | "confirmed";

export type AddressDecision =
  | "confirmed"
  | "review_requested";

export type MatchType =
  | "exact"
  | "fuzzy"
  | "landmark";

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

export interface AddressCandidate {
  localityId: string;
  locality: Locality;
  score: number;
  matchType: MatchType;
  reasons: string[];
  source?: string | null;
}

export interface ResolveAddressData {
  address: string;
}

// Search response
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
  selectedCandidate?: AddressCandidate | null;
  updatedAt?: string;
}

// Address details response
export interface AddressJobResponse {
  success: boolean;
  jobId: string;
  status: AddressStatus;
  originalAddress: string;
  candidates: AddressCandidate[];
  ambiguous: boolean;
  requiresConfirmation: boolean;
  createdAt: string;
  updatedAt: string;

  decision: AddressDecision | null;
  selectedCandidate: AddressCandidate | null;
}

// Feedback request
export type AddressFeedbackData =
  | {
      jobId: string;
      decision: "confirmed";
      localityId: string;
    }
  | {
      jobId: string;
      decision: "no_correct_match";
    };

// Feedback response
export interface AddressFeedbackResponse {
  success: boolean;
  jobId: string;
  status: AddressStatus;
  decision: AddressDecision;
  selectedCandidate: AddressCandidate | null;
  requiresConfirmation: boolean;
  message: string;
  updatedAt: string;
}

// Search history item
export interface AddressHistoryItem {
  jobId: string;
  originalAddress: string;
  status: AddressStatus;
  decision: AddressDecision | null;
  candidateCount: number;
  selectedCandidate: AddressCandidate | null;
  requiresConfirmation: boolean;
  createdAt: string;
  updatedAt: string;
}

// Paginated history response
export interface AddressHistoryResponse {
  success: boolean;
  items: AddressHistoryItem[];

  pagination: {
    limit: number;
    hasMore: boolean;
    nextCursor: string | null;
  };
}

// Reusable address status label
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