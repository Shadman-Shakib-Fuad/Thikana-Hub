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
  revision?: number;
  saved?: boolean;
  savedAt?: string | null;
}

export interface AddressJobResponse {
  success: boolean;
  jobId: string;
  originalAddress: string;
  status: AddressStatus;
  decision: AddressDecision | null;
  selectedCandidate: AddressCandidate | null;
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

export interface AddressFeedbackResponse {
  success: boolean;
  jobId: string;
  status: AddressStatus;
  decision: AddressDecision;
  revision: number;
  selectedCandidate: AddressCandidate | null;
  requiresConfirmation: boolean;
  message: string;
  updatedAt: string;
}

export interface AddressHistoryItem {
  jobId: string;
  originalAddress: string;
  status: AddressStatus;
  decision: AddressDecision | null;
  candidateCount: number;
  selectedCandidate: AddressCandidate | null;
  requiresConfirmation: boolean;
  revision: number;
  saved: boolean;
  savedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AddressHistoryResponse {
  success: boolean;
  items: AddressHistoryItem[];

  pagination: {
    limit: number;
    hasMore: boolean;
    nextCursor: string | null;
  };
}

export interface SaveAddressData {
  saved: boolean;
  revision: number;
}

export interface SaveAddressResponse {
  success: boolean;
  jobId: string;
  saved: boolean;
  savedAt: string | null;
  revision: number;
  message: string;
}

export interface EditAddressData {
  address: string;
  revision: number;
}

export interface DeleteAddressData {
  revision: number;
}

export interface DeleteAddressResponse {
  success: boolean;
  jobId: string;
  deleted: boolean;
  message: string;
}

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