import { Router } from "express";

import {
  checkDatabaseHealth,
} from "../config/database.js";

const router = Router();

router.get("/", async (req, res) => {
  res.setHeader("Cache-Control", "no-store");

  try {
    await checkDatabaseHealth();

    return res.status(200).json({
      success: true,
      service: "ThikanaHub API",
      version: "1.0.0",
      status: "operational",
      timestamp: new Date().toISOString(),
    });
  } catch {
    return res.status(503).json({
      success: false,
      service: "ThikanaHub API",
      status: "unavailable",
      requestId: req.requestId,
    });
  }
});

export default router;