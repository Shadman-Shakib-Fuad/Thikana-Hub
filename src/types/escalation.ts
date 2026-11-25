export interface EscalationRecord {
  jobId: string;
  revision: number;
  addressStatus: string;
  reviewStatus: "escalated";
  assignedAt: string;
  escalatedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface EscalationStatisticsResponse {
  success: true;
  summary: {
    totalEscalated: number;
  };
  generatedAt: string;
}

export interface EscalationInvestigation {
  jobId: string;
  revision: number;
  version: string;
  originalAddress: string;
  reviewerNote: string;
  escalatedAt: string;
  reviewStatus: "escalated";
}

export interface HandoffResponse {
  success: true;
  jobId: string;
  revision: number;
  reviewStatus: "pending";
  assignedAt: string;
  message: string;
}

export interface ReviewerHandoffContextResponse {
  success: true;
  context: {
    note: string;
    handedOffAt: string;
    assignedAt: string;
  } | null;
}
