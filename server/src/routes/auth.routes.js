import { Router } from "express";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import { createHash } from "node:crypto";

import { env } from "../config/env.js";
import { isTrustedOrigin, isMobileRequest } from "../utils/mobile-auth.js";
import { getMainDB } from "../config/database.js";

import {
  hashPassword,
  verifyPassword,
  verifyDummyPassword,
} from "../utils/password.js";

import {
  createSession,
  getSessionHash,
  revokeSession,
  setSessionCookie,
  clearSessionCookie,
} from "../utils/session.js";

import {
  requireAuth,
  requireRole,
} from "../middleware/auth.middleware.js";

import {
  recordAudit,
} from "../services/audit.service.js";

const router = Router();

// =====================================
// AUTHENTICATION SECURITY
// =====================================

router.use((req, res, next) => {
  res.setHeader("Cache-Control", "no-store");

  // Restrict state-changing requests
  // to our trusted website or enabled, cookieless mobile origin.

  if (
    req.method !== "GET" &&
    req.method !== "HEAD" &&
    !isTrustedOrigin(req, env.CLIENT_URL, env.MOBILE_AUTH_ENABLED)
  ) {
    return res.status(403).json({
      success: false,
      code: "UNTRUSTED_ORIGIN",
      message: "Request origin is not allowed.",
    });
  }

  next();
});

// =====================================
// RATE LIMITING
// =====================================

const rateLimitMessage = {
  success: false,
  code: "AUTH_RATE_LIMIT",
  message:
    "Too many attempts. Please try again later.",
};

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: rateLimitMessage,
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: rateLimitMessage,
});

const accountLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,

  keyGenerator: (req) => {
    const email =
      typeof req.body?.email === "string"
        ? req.body.email.trim().toLowerCase()
        : "invalid";

    return createHash("sha256")
      .update(email)
      .digest("hex");
  },

  message: rateLimitMessage,
});

// =====================================
// INPUT VALIDATION
// =====================================

const emailSchema = z
  .string()
  .trim()
  .max(254)
  .email()
  .transform((email) => email.toLowerCase());

const registerSchema = z
  .object({
    name: z.string().trim().min(2).max(100),

    email: emailSchema,

    password: z.string().min(15).max(128),
  })
  .strict();

const loginSchema = z
  .object({
    email: emailSchema,

    password: z.string().min(1).max(128),
  })
  .strict();

// =====================================
// SAFE USER RESPONSE
// =====================================

function publicUser(user) {
  return {
    id: user._id.toString(),

    name: user.name,

    email: user.email,

    role: user.role,

    status: user.status,

    createdAt: user.createdAt,
  };
}

// =====================================
// REGISTER
// =====================================

router.post(
  "/register",
  registerLimiter,
  async (req, res) => {
    const validation =
      registerSchema.safeParse(req.body);

    if (!validation.success) {
      return res.status(400).json({
        success: false,
        code: "INVALID_INPUT",
        message:
          "Enter valid account details and a password of at least 15 characters.",
      });
    }

    const { name, email, password } =
      validation.data;

    const users = getMainDB()
      .collection("users");

    const passwordHash =
      await hashPassword(password);

    const now = new Date();

    const user = {
      name,

      email,

      passwordHash,

      role: "merchant",

      status: "active",

      createdAt: now,

      updatedAt: now,
    };

    let result;

    try {
      result = await users.insertOne(user);
    } catch (error) {
      if (error.code === 11000) {
        await recordAudit({
          req,
          action: "REGISTER",
          result: "denied",
        });

        return res.status(409).json({
          success: false,
          code: "ACCOUNT_CONFLICT",
          message:
            "Unable to create an account with these details.",
        });
      }

      throw error;
    }

    await recordAudit({
      req,
      userId: result.insertedId,
      targetId: result.insertedId,
      action: "REGISTER",
      result: "success",
    });

    return res.status(201).json({
      success: true,
      message:
        "Account created successfully. Please sign in.",

      user: publicUser({
        ...user,
        _id: result.insertedId,
      }),
    });
  }
);

// =====================================
// LOGIN
// =====================================

router.post(
  "/login",
  loginLimiter,
  accountLimiter,
  async (req, res) => {
    const validation =
      loginSchema.safeParse(req.body);

    if (!validation.success) {
      return res.status(400).json({
        success: false,
        code: "INVALID_INPUT",
        message:
          "Please enter valid login credentials.",
      });
    }

    const { email, password } =
      validation.data;

    const users = getMainDB()
      .collection("users");

    const user = await users.findOne({
      email,
    });

    let passwordValid = false;

    if (user) {
      passwordValid = await verifyPassword(
        password,
        user.passwordHash
      );
    } else {
      await verifyDummyPassword(password);
    }

    if (
      !user ||
      !passwordValid ||
      user.status !== "active"
    ) {
      await recordAudit({
        req,
        userId: user?._id || null,
        action: "LOGIN",
        result: "failed",
      });

      return res.status(401).json({
        success: false,
        code: "INVALID_CREDENTIALS",
        message:
          "Invalid email or password.",
      });
    }

    const mobile = isMobileRequest(req, env.MOBILE_AUTH_ENABLED);
    const oldSessionHash = getSessionHash(req);

    const session = await createSession(
      user._id, user.securityVersion ?? null, user.role,
      mobile ? "mobile" : "web"
    );

    try {
      await revokeSession(oldSessionHash);

      const unchanged = await users.updateOne(
        {
          _id: user._id,
          status: "active",
          role: user.role,
          securityVersion: user.securityVersion ?? null,
          passwordHash: user.passwordHash,
        },
        {
          $set: {
            lastLoginAt: new Date(),
          },
        }
      );

      if (unchanged.matchedCount !== 1) {
        await revokeSession(session.tokenHash);
        return res.status(409).json({
          success: false,
          code: "ACCOUNT_CHANGED",
          message: "Account details changed. Please sign in again.",
        });
      }

      await recordAudit({
        req,
        userId: user._id,
        action: "LOGIN",
        result: "success",
      });
    } catch (error) {
      await revokeSession(session.tokenHash);
      throw error;
    }

    if (!mobile) {
      setSessionCookie(res, session.token);
    }

    return res.status(200).json({
      success: true,
      message: "Signed in successfully.",
      user: publicUser(user),
      ...(mobile ? { sessionToken: session.token } : {}),
    });
  }
);

// =====================================
// CURRENT AUTHENTICATED USER
// =====================================

router.get(
  "/me",
  requireAuth,
  (req, res) => {
    return res.status(200).json({
      success: true,
      user: publicUser(req.user),
    });
  }
);

// =====================================
// ROLE PROTECTION TEST
// =====================================

router.get(
  "/admin-check",
  requireAuth,
  requireRole("admin"),
  (req, res) => {
    return res.status(200).json({
      success: true,
      message: "Administrator access verified.",
    });
  }
);

// =====================================
// LOGOUT
// =====================================

router.post(
  "/logout",
  async (req, res) => {
    const tokenHash =
      getSessionHash(req);

    const session =
      await revokeSession(tokenHash);

    if (!isMobileRequest(req, env.MOBILE_AUTH_ENABLED)) {
      clearSessionCookie(res);
    }

    if (session) {
      await recordAudit({
        req,
        userId: session.userId,
        action: "LOGOUT",
        result: "success",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Signed out successfully.",
    });
  }
);

export default router;
