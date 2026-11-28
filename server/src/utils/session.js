import {
  randomBytes,
} from "node:crypto";

import { env } from "../config/env.js";
import { getMainDB } from "../config/database.js";
import { hashTokenForTransport, getRequestSessionHash } from "./mobile-auth.js";

export const SESSION_COOKIE =
  "thikanahub_session";

export const IDLE_TIMEOUT =
  30 * 60 * 1000;

export const MAX_SESSION_AGE =
  7 * 24 * 60 * 60 * 1000;

export function hashSessionToken(token) {
  return hashTokenForTransport(token, "web");
}

export function getSessionHash(req) {
  return getRequestSessionHash(
    req, SESSION_COOKIE, env.CLIENT_URL, env.MOBILE_AUTH_ENABLED
  );
}

export async function createSession(userId, securityVersion = null, role = null, transport = "web") {
  if (transport === "mobile" && !env.MOBILE_AUTH_ENABLED) {
    throw new Error("Mobile authentication is disabled.");
  }
  const token = randomBytes(32).toString("hex");
  const tokenHash = hashTokenForTransport(token, transport);

  const now = new Date();

  await getMainDB()
    .collection("sessions")
    .insertOne({
      _id: tokenHash,
      userId,
      securityVersion,
      role,

      createdAt: now,
      lastSeenAt: now,

      expiresAt: new Date(
        now.getTime() + IDLE_TIMEOUT
      ),

      absoluteExpiresAt: new Date(
        now.getTime() + MAX_SESSION_AGE
      ),
    });

  return {
    token,
    tokenHash,
  };
}

function getCookieOptions() {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  };
}

export function setSessionCookie(res, token) {
  res.cookie(
    SESSION_COOKIE,
    token,
    {
      ...getCookieOptions(),
      maxAge: MAX_SESSION_AGE,
    }
  );
}

export function clearSessionCookie(res) {
  res.clearCookie(
    SESSION_COOKIE,
    getCookieOptions()
  );
}

export async function revokeSession(tokenHash) {
  if (!tokenHash) {
    return null;
  }

  return getMainDB()
    .collection("sessions")
    .findOneAndDelete({
      _id: tokenHash,
    });
}
