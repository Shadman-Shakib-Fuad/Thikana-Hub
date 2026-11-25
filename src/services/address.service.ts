import { apiRequest } from "@/services/api";

import type {
  ResolveAddressData,
  AddressResolutionResponse,
  AddressJobResponse,
  AddressFeedbackData,
  AddressFeedbackResponse,
  AddressHistoryResponse,
  SaveAddressData,
  SaveAddressResponse,
  EditAddressData,
  DeleteAddressData,
  DeleteAddressResponse,
} from "@/types/address";

function paginationParams(
  limit: number,
  cursor?: string | null
) {
  const params = new URLSearchParams({
    limit: String(limit),
  });

  if (cursor) {
    params.set("cursor", cursor);
  }

  return params.toString();
}

export const addressService = {
  resolveAddress(data: ResolveAddressData) {
    return apiRequest<AddressResolutionResponse>(
      "/p14/address-resolutions",
      {
        method: "POST",
        body: data,
      }
    );
  },

  getAddressJob(jobId: string) {
    return apiRequest<AddressJobResponse>(
      `/jobs/${encodeURIComponent(jobId)}`
    );
  },

  submitFeedback(data: AddressFeedbackData) {
    return apiRequest<AddressFeedbackResponse>(
      "/p14/address-feedback",
      {
        method: "POST",
        body: data,
      }
    );
  },

  getHistory(
    limit = 10,
    cursor?: string | null
  ) {
    return apiRequest<AddressHistoryResponse>(
      `/p14/address-history?${paginationParams(limit, cursor)}`
    );
  },

  getSavedAddresses(
    limit = 10,
    cursor?: string | null
  ) {
    return apiRequest<AddressHistoryResponse>(
      `/p14/saved-addresses?${paginationParams(limit, cursor)}`
    );
  },

  saveAddress(
    jobId: string,
    data: SaveAddressData
  ) {
    return apiRequest<SaveAddressResponse>(
      `/p14/saved-addresses/${encodeURIComponent(jobId)}`,
      {
        method: "PATCH",
        body: data,
      }
    );
  },

  editAddress(
    jobId: string,
    data: EditAddressData
  ) {
    return apiRequest<AddressJobResponse>(
      `/p14/address-requests/${encodeURIComponent(jobId)}`,
      {
        method: "PATCH",
        body: data,
      }
    );
  },

  deleteAddress(
    jobId: string,
    data: DeleteAddressData
  ) {
    return apiRequest<DeleteAddressResponse>(
      `/p14/address-requests/${encodeURIComponent(jobId)}`,
      {
        method: "DELETE",
        body: data,
      }
    );
  },
};