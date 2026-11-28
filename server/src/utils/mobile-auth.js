import { createHash } from "node:crypto";

export const MOBILE_ORIGIN = "https://localhost";

export function getAllowedOrigins(websiteOrigin, mobileEnabled = false) {
  return mobileEnabled
    ? [websiteOrigin, MOBILE_ORIGIN]
    : [websiteOrigin];
}

export function isMobileRequest(req, mobileEnabled = false) {
  return (
    mobileEnabled === true &&
    req.get("Origin") === MOBILE_ORIGIN &&
    req.get("Cookie") === undefined
  );
}

export function isTrustedOrigin(req, websiteOrigin, mobileEnabled = false) {
  return (
    req.get("Origin") === websiteOrigin ||
    isMobileRequest(req, mobileEnabled)
  );
}

export function getMobileBearerToken(req, mobileEnabled = false) {
  if (!isMobileRequest(req, mobileEnabled)) return null;

  const authorization = req.get("Authorization");

  if (typeof authorization !== "string" || authorization.length !== 71) {
    return null;
  }

  const match = /^Bearer ([a-f0-9]{64})$/.exec(authorization);

  return match ? match[1] : null;
}

// Domain separation preserves all existing website session hashes while
// preventing a mobile token from being used as a website cookie (or vice versa).
export function hashTokenForTransport(token, transport = "web") {
  if (transport !== "web" && transport !== "mobile") {
    throw new TypeError("Invalid session transport");
  }
  return createHash("sha256")
    .update(transport === "mobile" ? `mobile:${token}` : token)
    .digest("hex");
}

export function getRequestSessionHash(req, cookieName, websiteOrigin, mobileEnabled = false) {
  const origin = req.get("Origin");
  if (origin === MOBILE_ORIGIN && origin !== websiteOrigin) {
    const token = getMobileBearerToken(req, mobileEnabled);
    return token ? hashTokenForTransport(token, "mobile") : null;
  }

  // Never fall back to cookies when a Bearer credential is supplied.
  if (req.get("Authorization") !== undefined) return null;
  const token = req.cookies?.[cookieName];
  if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token)) return null;
  return hashTokenForTransport(token, "web");
}
