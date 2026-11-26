import adminManagementRoutes from "./admin-management.routes.js";
import { Router } from "express";

import {
  adminAccess,
  rejectUnexpectedQuery,
} from "../middleware/admin.middleware.js";

import {
  getAdminStatistics,
} from "../services/admin-statistics.service.js";

import adminUsersRoutes
  from "./admin-users.routes.js";

const router = Router();

const BASE = "/p14/admin";

// =====================================
// ADMIN ACCESS VERIFICATION
// =====================================

router.get(
  `${BASE}/access`,

  ...adminAccess,

  rejectUnexpectedQuery,

  (req, res) => {
    return res.status(200).json({
      success: true,

      administrator: {
        userId:
          req.user._id.toString(),

        role: req.user.role,
      },

      access: {
        adminPortal: true,
      },

      generatedAt:
        new Date().toISOString(),
    });
  }
);

// =====================================
// ADMIN SYSTEM STATISTICS
// =====================================

router.get(
  `${BASE}/statistics`,

  ...adminAccess,

  rejectUnexpectedQuery,

  async (req, res) => {
    try {
      const statistics =
        await getAdminStatistics();

      return res.status(200).json({
        success: true,

        statistics,
      });

    } catch (error) {
      console.error(
        "[ADMIN_STATISTICS_ERROR]",
        error.name,
        error.code ?? ""
      );

      return res.status(503).json({
        success: false,

        code:
          "ADMIN_STATISTICS_UNAVAILABLE",

        message:
          "System statistics are temporarily unavailable. Please try again later.",
      });
    }
  }
);

// =====================================
// ADMIN USER MANAGEMENT
// =====================================

router.use(adminUsersRoutes);
router.use(adminManagementRoutes);

export default router;
