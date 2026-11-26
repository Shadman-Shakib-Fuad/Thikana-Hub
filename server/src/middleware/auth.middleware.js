import {
  getMainDB,
} from "../config/database.js";

import {
  getSessionHash,
  IDLE_TIMEOUT,
  revokeSession,
} from "../utils/session.js";

import {
  recordAudit,
} from "../services/audit.service.js";

export async function requireAuth(
  req,
  res,
  next
) {
  const tokenHash = getSessionHash(req);

  if (!tokenHash) {
    return res.status(401).json({
      success: false,
      code: "AUTH_REQUIRED",
      message: "Please sign in to continue.",
    });
  }

  const db = getMainDB();
  const now = new Date();

  const session = await db
    .collection("sessions")
    .findOneAndUpdate(
      {
        _id: tokenHash,
        expiresAt: { $gt: now },
        absoluteExpiresAt: { $gt: now },
      },
      [
        {
          $set: {
            lastSeenAt: now,

            expiresAt: {
              $min: [
                new Date(
                  now.getTime() + IDLE_TIMEOUT
                ),
                "$absoluteExpiresAt",
              ],
            },
          },
        },
      ],
      {
        returnDocument: "after",
      }
    );

  if (!session) {
    return res.status(401).json({
      success: false,
      code: "SESSION_EXPIRED",
      message: "Your session has expired.",
    });
  }

  const user = await db
    .collection("users")
    .findOne(
      {
        _id: session.userId,
        status: "active",
      },
      {
        projection: {
          passwordHash: 0,
        },
      }
    );

  if (!user) {
    await revokeSession(tokenHash);

    return res.status(401).json({
      success: false,
      code: "ACCOUNT_UNAVAILABLE",
      message: "Your account is unavailable.",
    });
  }

  // A session created before an account security transition cannot
  // inherit its new permissions, even if the session insert raced it.
  if (
    (session.securityVersion ?? null) !== (user.securityVersion ?? null) ||
    (session.role != null && session.role !== user.role)
  ) {
    await revokeSession(tokenHash);
    return res.status(401).json({
      success: false,
      code: "SESSION_EXPIRED",
      message: "Your session has expired. Please sign in again.",
    });
  }

  req.user = user;
  req.sessionHash = tokenHash;

  next();
}

export function requireRole(...allowedRoles) {
  return async function (req, res, next) {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required.",
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      await recordAudit({
        req,
        userId: req.user._id,
        action: "ACCESS_DENIED",
        result: "denied",
      });

      return res.status(403).json({
        success: false,
        code: "ACCESS_DENIED",
        message: "You do not have permission.",
      });
    }

    next();
  };
}
