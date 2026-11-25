import type {
  ProposalKind,
  ProposalStatus,
} from "@/types/data-manager";

export const NAME_FIELDS = [
  ["nameEn", "Locality name (English)"],
  ["nameBn", "Locality name (বাংলা)"],
  ["areaEn", "Area (English)"],
  ["areaBn", "Area (বাংলা)"],
  ["districtEn", "District (English)"],
  ["districtBn", "District (বাংলা)"],
  ["divisionEn", "Division (English)"],
  ["divisionBn", "Division (বাংলা)"],
] as const;

export type NameField =
  (typeof NAME_FIELDS)[number][0];

export type LocalityNames =
  Record<NameField, string>;

export const TERM_FIELDS = [
  ["aliases", "Locality aliases"],
  ["areaAliases", "Area aliases"],
  ["districtAliases", "District aliases"],
  ["landmarks", "Landmarks"],
] as const;

export type TermField =
  (typeof TERM_FIELDS)[number][0];

export interface LocalityRecord {
  localityId: string;
  locality: LocalityNames;
  approved: boolean;
  aliases: string[];
  areaAliases: string[];
  districtAliases: string[];
  landmarks: string[];
  source: string | null;
  precision: string | null;
  updatedAt: string | null;
}

export interface Pagination {
  limit: number;
  hasMore: boolean;
  nextCursor: string | null;
}

export interface PageResponse<T> {
  success: true;
  items: T[];
  pagination: Pagination;
}

export interface ProposalDecision {
  action: "approve" | "reject";
  reason: string;
  decidedAt: string;
  published: boolean;
}

export interface ProposalRecord {
  proposalId: string;
  localityId: string;
  operation: "create" | "update" | "add" | "remove";
  kind?: ProposalKind;
  locality?: LocalityNames;
  baseLocality?: LocalityNames | null;
  field?: TermField;
  term?: string;
  baseTerms?: string[];
  reason: string;
  evidence: string;
  status: ProposalStatus;
  decision?: ProposalDecision | null;
  createdAt: string;
  updatedAt: string;
}

export interface ItemResponse<T> {
  success: true;
  item: T;
}

export interface LocalityTermsResponse {
  success: true;
  localityId: string;
  nameEn: string;
  nameBn: string;
  fields: {
    field: TermField;
    supported: boolean;
    items: string[];
  }[];
}
