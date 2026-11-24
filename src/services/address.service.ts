import { apiRequest } from "@/services/api";

import type {
  ResolveAddressData,
  AddressResolutionResponse,
  AddressJobResponse,
} from "@/types/address";

export const addressService = {
  // Resolve a new address
  resolveAddress(data: ResolveAddressData) {
    return apiRequest<AddressResolutionResponse>(
      "/p14/address-resolutions",
      {
        method: "POST",
        body: data,
      }
    );
  },

  // Retrieve an owned address request
  getAddressJob(jobId: string) {
    return apiRequest<AddressJobResponse>(
      `/jobs/${encodeURIComponent(jobId)}`,
      {
        method: "GET",
      }
    );
  },
};