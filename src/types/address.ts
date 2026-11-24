export type AddressStatus =
  | "needs_review"
  | "no_confident_match"
  | "confirmed";

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
}

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
}