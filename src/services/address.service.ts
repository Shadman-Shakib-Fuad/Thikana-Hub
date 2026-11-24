import { apiRequest } from "@/services/api";

import type {
  ResolveAddressData,
  AddressResolutionResponse,
  AddressJobResponse,
  AddressFeedbackData,
  AddressFeedbackResponse,
  AddressHistoryResponse,
} from "@/types/address";

export const addressService = {
  // Resolve new address
  resolveAddress(data: ResolveAddressData) {
    return apiRequest<AddressResolutionResponse>(
      "/p14/address-resolutions",
      {
        method: "POST",
        body: data,
      }
    );
  },

  // Retrieve address details
  getAddressJob(jobId: string) {
    return apiRequest<AddressJobResponse>(
      `/jobs/${encodeURIComponent(jobId)}`,
      {
        method: "GET",
      }
    );
  },

  // Confirm locality or request manual review
  submitFeedback(data: AddressFeedbackData) {
    return apiRequest<AddressFeedbackResponse>(
      "/p14/address-feedback",
      {
        method: "POST",
        body: data,
      }
    );
  },

  // Retrieve paginated search history
  getHistory(
    limit = 10,
    cursor?: string | null
  ) {
    const params = new URLSearchParams({
      limit: String(limit),
    });

    if (cursor) {
      params.set("cursor", cursor);
    }

    return apiRequest<AddressHistoryResponse>(
      `/p14/address-history?${params.toString()}`,
      {
        method: "GET",
      }
    );
  },
};