import { Router } from "express";
import { z } from "zod";

import {
  adminAccess,
  rejectUnexpectedQuery,
} from "../middleware/admin.middleware.js";

import {
  listAdminUsers,
  getAdminUser,
  getRoleEligibility,
} from "../services/admin-users.service.js";

import {
  recordAudit,
} from "../services/audit.service.js";

import { env } from "../config/env.js";
import { assignAdminRole, RoleAssignmentError } from "../services/admin-role.service.js";

const router = Router();

const BASE = "/p14/admin/users";

// =====================================
// STRICT VALIDATION SCHEMAS
// =====================================

const idSchema = z.string()
  .regex(/^[a-fA-F0-9]{24}$/);

const querySchema = z.object({
  q: z.string()
    .trim()
    .max(80)
    .refine(
      value => !/[\u0000-\u001f\u007f]/.test(value)
    )
    .optional(),

  role: z.enum([
    "all",
    "merchant",
    "reviewer",
    "data_manager",
    "admin",
  ]).default("all"),

  status: z.enum([
    "all",
    "active",
    "suspended",
  ]).default("all"),

  limit: z.string()
    .regex(/^(?:[1-9]|[1-4][0-9]|50)$/)
    .default("20")
    .transform(Number),

  cursor:
    idSchema.optional(),

}).strict();

function invalidQuery(res) {
  return res.status(400).json({
    success: false,

    code: "INVALID_QUERY",

    message:
      "Invalid user search or filter parameters.",
  });
}

function validateUserId(req, res, next) {
  const parsed =
    idSchema.safeParse(req.params.userId);

  if (!parsed.success) {
    return res.status(400).json({
      success: false,

      code: "INVALID_USER_ID",

      message:
        "Invalid user ID.",
    });
  }

  req.validatedUserId =
    parsed.data.toLowerCase();

  next();
}

function notFound(res) {
  return res.status(404).json({
    success: false,

    code: "USER_NOT_FOUND",

    message:
      "The requested user was not found.",
  });
}

function unavailable(res, error) {
  console.error(
    "[ADMIN_USERS_ERROR]",
    error.name,
    error.code ?? ""
  );

  return res.status(503).json({
    success: false,

    code: "ADMIN_USERS_UNAVAILABLE",

    message:
      "User management is temporarily unavailable. Please try again later.",
  });
}

// =====================================
// GET ALL USERS
// =====================================

router.get(
  BASE,

  ...adminAccess,

  async (req, res) => {
    const validation =
      querySchema.safeParse(req.query);

    if (!validation.success) {
      return invalidQuery(res);
    }

    try {
      const result =
        await listAdminUsers(
          validation.data
        );

      await recordAudit({
        req,

        userId: req.user._id,

        action: "ADMIN_USER_LIST",

        result: "success",
      });

      return res.status(200).json({
        success: true,

        ...result,
      });

    } catch (error) {
      return unavailable(res, error);
    }
  }
);

// =====================================
// GET INDIVIDUAL USER
// =====================================

router.get(
  `${BASE}/:userId`,

  ...adminAccess,

  rejectUnexpectedQuery,

  validateUserId,

  async (req, res) => {
    try {
      const user =
        await getAdminUser(
          req.validatedUserId
        );

      if (!user) {
        return notFound(res);
      }

      await recordAudit({
        req,

        userId: req.user._id,

        action: "ADMIN_USER_DETAIL_ACCESS",

        result: "success",

        targetId: req.validatedUserId,
      });

      return res.status(200).json({
        success: true,

        item: user,
      });

    } catch (error) {
      return unavailable(res, error);
    }
  }
);

// =====================================
// CHECK ROLE ELIGIBILITY
// =====================================

router.get(
  `${BASE}/:userId/role-eligibility`,

  ...adminAccess,

  rejectUnexpectedQuery,

  validateUserId,

  async (req, res) => {
    try {
      const eligibility =
        await getRoleEligibility(
          req.validatedUserId,
          req.user._id
        );

      if (!eligibility) {
        return notFound(res);
      }

      await recordAudit({
        req,

        userId: req.user._id,

        action:
          "ADMIN_ROLE_ELIGIBILITY_ACCESS",

        result: "success",

        targetId: req.validatedUserId,
      });

      return res.status(200).json({
        success: true,

        eligibility,
      });

    } catch (error) {
      return unavailable(res, error);
    }
  }
);

const roleSchema = z.object({
  role: z.enum(["reviewer", "data_manager"]),
}).strict();

router.post(
  `${BASE}/:userId/role`,
  ...adminAccess,
  rejectUnexpectedQuery,
  validateUserId,
  async (req, res) => {
    if (req.get("Origin") !== env.CLIENT_URL) {
      return res.status(403).json({
        success: false, code: "UNTRUSTED_ORIGIN",
        message: "Request origin is not allowed.",
      });
    }
    const parsed = roleSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false, code: "INVALID_ROLE_ASSIGNMENT",
        message: "Select Reviewer or Data Manager only.",
      });
    }
    try {
      const result = await assignAdminRole(req, req.validatedUserId, parsed.data.role);
      return res.status(200).json({ success: true, ...result });
    } catch (error) {
      if (error instanceof RoleAssignmentError) {
        return res.status(error.status).json({
          success: false, code: error.code, message: error.message,
        });
      }
      console.error("[ADMIN_ROLE_ERROR]", error.name, error.code ?? "");
      return res.status(503).json({
        success: false, code: "ROLE_ASSIGNMENT_UNAVAILABLE",
        message: "Unable to confirm the role assignment. Refresh the user details before retrying.",
      });
    }
  }
);

export default router;
