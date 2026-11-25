import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import cookieParser from "cookie-parser";
import { randomUUID } from "node:crypto";

import { env } from "./config/env.js";

import {
  connectDatabases,
  closeDatabases,
} from "./config/database.js";

import {
  initializeIndexes,
} from "./config/indexes.js";

import {
  initializeReviewerIndexes,
} from "./services/reviewer-admin.service.js";

import {
  notFoundHandler,
  errorHandler,
} from "./middleware/errorHandler.js";

// =====================================
// ROUTE IMPORTS
// =====================================

import healthRoutes from "./routes/health.routes.js";
import authRoutes from "./routes/auth.routes.js";
import addressRoutes from "./routes/address.routes.js";
import merchantRoutes from "./routes/merchant.routes.js";
import savedRoutes from "./routes/saved.routes.js";
import manageAddressRoutes from "./routes/manage-address.routes.js";
import analyticsRoutes from "./routes/analytics.routes.js";

import reviewerRoutes, {
  initializeReviewerHistoryIndex,
} from "./routes/reviewer.routes.js";

import merchantReviewRoutes from "./routes/merchant-review.routes.js";
import reviewerStatisticsRoutes from "./routes/reviewer-statistics.routes.js";

// =====================================
// EXPRESS APPLICATION
// =====================================

const app = express();

app.disable("x-powered-by");

// =====================================
// REQUEST ID
// =====================================

app.use((req, res, next) => {
  req.requestId = randomUUID();

  res.setHeader(
    "X-Request-ID",
    req.requestId
  );

  next();
});

// =====================================
// SECURITY & CORS
// =====================================

app.use(helmet());

app.use(
  cors({
    origin: [env.CLIENT_URL],

    credentials: true,

    methods: [
      "GET",
      "POST",
      "PUT",
      "PATCH",
      "DELETE",
      "OPTIONS",
    ],

    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Review-Assignment",
    ],

    exposedHeaders: [
      "X-Request-ID",
    ],
  })
);

// =====================================
// GLOBAL API RATE LIMIT
// =====================================

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 200,

  standardHeaders: true,
  legacyHeaders: false,

  message: {
    success: false,
    code: "RATE_LIMIT_EXCEEDED",
    message:
      "Too many requests. Please try again later.",
  },
});

app.use("/api", apiLimiter);

app.use(
  express.json({
    limit: "16kb",
  })
);

app.use(cookieParser());

// =====================================
// ROOT API
// =====================================

app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    service: "ThikanaHub API",
    version: "1.0.0",
    message: "ThikanaHub Backend is running.",
    health: "/api/v1/health",
  });
});

// =====================================
// API ROUTES
// =====================================

app.use("/api/v1/health", healthRoutes);
app.use("/api/v1/auth", authRoutes);

app.use("/api/v1", addressRoutes);
app.use("/api/v1", merchantRoutes);
app.use("/api/v1", savedRoutes);
app.use("/api/v1", manageAddressRoutes);
app.use("/api/v1", analyticsRoutes);
app.use("/api/v1", reviewerRoutes);
app.use("/api/v1", merchantReviewRoutes);

// NEW: Reviewer statistics

app.use(
  "/api/v1",
  reviewerStatisticsRoutes
);

// =====================================
// CENTRAL ERROR HANDLING
// =====================================

app.use(notFoundHandler);
app.use(errorHandler);

// =====================================
// STARTUP ERROR DIAGNOSTICS
// =====================================

function logStartupError(error) {
  console.error("");
  console.error("================================");
  console.error("       STARTUP ERROR");
  console.error("================================");

  console.error(
    "Error Name:",
    error.name || "UnknownError"
  );

  console.error(
    "Error Code:",
    error.code ||
    error.cause?.code ||
    "N/A"
  );

  if (error.reason?.type) {
    console.error(
      "Topology:",
      error.reason.type
    );
  }

  const servers =
    error.reason?.servers?.values?.() || [];

  for (const server of servers) {
    console.error(
      "Server Type:",
      server.type || "Unknown"
    );

    if (server.error) {
      console.error(
        "Server Error:",
        server.error.name || "UnknownError"
      );

      console.error(
        "Server Error Code:",
        server.error.code ||
        server.error.cause?.code ||
        "N/A"
      );
    }
  }

  console.error("");
  console.error("Possible checks:");
  console.error("- MongoDB Atlas cluster status");
  console.error("- Network connectivity");
  console.error("- Atlas IP access list");
  console.error("- Database credentials");
  console.error("- DNS or TLS connectivity");
  console.error("================================");
}

// =====================================
// START SERVER
// =====================================

async function startServer() {
  try {
    console.log(
      "[STARTUP] Connecting to MongoDB databases..."
    );

    await connectDatabases();
    await initializeIndexes();
    await initializeReviewerIndexes();
    await initializeReviewerHistoryIndex();

    const server = app.listen(
      env.PORT,
      "127.0.0.1",

      () => {
        console.log("");
        console.log("================================");
        console.log("       THIKANAHUB BACKEND");
        console.log("================================");

        console.log(
          `Server: http://127.0.0.1:${env.PORT}`
        );

        console.log(
          `Health: http://127.0.0.1:${env.PORT}/api/v1/health`
        );

        console.log(
          `Environment: ${env.NODE_ENV}`
        );

        console.log("");

        console.log("[AUTH] Authentication API ready");
        console.log("[SECURITY] Security middleware active");
        console.log("[CRYPTO] Encryption service configured");
        console.log("[ADDRESS] Address Resolution API ready");
        console.log("[MERCHANT] Merchant Management API ready");
        console.log("[SAVED] Saved Addresses API ready");
        console.log("[MANAGE] Address Edit & Delete API ready");
        console.log("[ANALYTICS] Merchant Analytics API ready");
        console.log("[REVIEWER] Assigned Review API ready");
        console.log("[REVIEW-SYNC] Merchant Review API ready");

        console.log(
          "[REVIEW-STATS] Reviewer Statistics API ready"
        );

        console.log("================================");
        console.log("");
      }
    );

    server.on("error", async (error) => {
      console.error(
        "[SERVER_ERROR]",
        error.code || "UNKNOWN_ERROR"
      );

      await closeDatabases();

      process.exit(1);
    });

    let shuttingDown = false;

    function shutdown() {
      if (shuttingDown) return;

      shuttingDown = true;

      console.log(
        "\n[SERVER] Shutting down ThikanaHub..."
      );

      server.close(async () => {
        await closeDatabases();

        console.log(
          "[DATABASE] All connections closed"
        );

        process.exit(0);
      });
    }

    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);

  } catch (error) {
    logStartupError(error);
    await closeDatabases();
    process.exit(1);
  }
}

startServer();