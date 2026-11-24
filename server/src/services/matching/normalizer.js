export const MAX_ADDRESS_LENGTH = 300;

export function normalizeDigits(text) {
  return text.replace(/[০-৯]/g, digit =>
    String(digit.charCodeAt(0) - "০".charCodeAt(0))
  );
}

export function normalizeAddress(text) {
  if (typeof text !== "string") return "";

  return normalizeDigits(text.normalize("NFKC").toLowerCase())
    .replace(/\p{Cf}/gu, "")
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function validateAddress(address) {
  if (typeof address !== "string") {
    return {
      valid: false,
      message: "Address must be text."
    };
  }

  if (!address.trim()) {
    return {
      valid: false,
      message: "Please enter an address."
    };
  }

  if (address.length > MAX_ADDRESS_LENGTH) {
    return {
      valid: false,
      message: "Address cannot exceed 300 characters."
    };
  }

  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/u.test(address)) {
    return {
      valid: false,
      message: "Address contains invalid characters."
    };
  }

  const normalized = normalizeAddress(address);

  if (normalized.length < 3 || !/\p{L}/u.test(normalized)) {
    return {
      valid: false,
      message: "Please enter a meaningful address."
    };
  }

  return {
    valid: true,
    normalized
  };
}

export function tokenizeAddress(address) {
  const normalized = normalizeAddress(address);

  return normalized
    ? normalized.split(" ")
    : [];
}