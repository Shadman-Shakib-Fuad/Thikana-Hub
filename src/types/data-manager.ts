export type ProposalStatus =
  | "pending"
  | "approved"
  | "rejected";

export type ProposalKind =
  | "locality"
  | "term";

export interface DataManagerProposalSummary {
  proposalId: string;
  kind: ProposalKind;
  localityId: string;
  operation: "create" | "update" | "add" | "remove";
  field: string | null;
  status: ProposalStatus;
  createdAt: string;
}

export interface DataManagerDashboardResponse {
  success: true;

  summary: {
    totalLocalities: number;
    approvedLocalities: number;
    totalEscalated: number;

    proposals: {
      total: number;
      pending: number;
      approved: number;
      rejected: number;
    };
  };

  recentProposals: DataManagerProposalSummary[];

  generatedAt: string;
}
