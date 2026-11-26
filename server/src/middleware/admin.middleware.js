import rateLimit from "express-rate-limit";

import {
  requireAuth,
  requireRole,
} from "./auth.middleware.js";

// =====================================
// ADMIN CACHE PROTECTION
// =====================================

export function adminNoStore(req, res, next) {
  res.setHeader(
    "Cache-Control",
    "no-store"
  );

  next();
}

// =====================================
// ADMIN RATE LIMITING
// =====================================

const adminLimiter = rateLimit({
  windowMs: 60 * 1000,

  limit: 40,

  standardHeaders: true,

  legacyHeaders: false,

  keyGenerator: (req) => {
    return `admin:${req.user._id.toString()}`;
  },

  message: {
    success: false,

    code: "ADMIN_RATE_LIMIT",

    message:
      "Too many administrative requests. Please try again later.",
  },
});

// =====================================
// REUSABLE ADMIN SECURITY CHAIN
// =====================================

export const adminAccess = [
  adminNoStore,

  requireAuth,

  requireRole("admin"),

  adminLimiter,
];

// =====================================
// STRICT QUERY VALIDATION
// =====================================

export function rejectUnexpectedQuery(
  req,
  res,
  next
) {
  if (Object.keys(req.query).length !== 0) {
    return res.status(400).json({
      success: false,

      code: "INVALID_QUERY",

      message:
        "Unexpected query parameters.",
    });
  }

  next();
}
