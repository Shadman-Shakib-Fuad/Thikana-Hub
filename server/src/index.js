import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

import { randomUUID } from "node:crypto";

import { env } from "./config/env.js";

import {
  connectDatabases,
  closeDatabases,
} from "./config/database.js";

import {
  notFoundHandler,
  errorHandler,
} from "./middleware/errorHandler.js";

import healthRoutes from "./routes/health.routes.js";

// Initialize Express application
const app = express();

// Disable unnecessary server information
app.disable("x-powered-by");

// =====================================
// REQUEST IDENTIFICATION
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
// SECURITY HEADERS
// =====================================

app.use(helmet());

// =====================================
// CORS CONFIGURATION
// =====================================

app.use(
  cors({
    origin: [env.CLIENT_URL],

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
    ],

    exposedHeaders: [
      "X-Request-ID",
    ],
  })
);

// =====================================
// API RATE LIMITING
// =====================================

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,

  limit: 200,

  standardHeaders: true,

  legacyHeaders: false,

  message: {
    success: false,
    code: "RATE_LIMIT_EXCEEDED",
    message: "Too many requests. Please try again later.",
  },
});

app.use("/api", apiLimiter);

// =====================================
// REQUEST BODY VALIDATION
// =====================================

app.use(
  express.json({
    limit: "16kb",
  })
);

// =====================================
// ROOT API
// =====================================

app.get("/", (req, res) => {
  return res.status(200).json({
    success: true,
    application: "ThikanaHub",
    description: "Bangla Address Resolution Engine",
    apiVersion: "v1",
    status: "running",
  });
});

// =====================================
// API ROUTES
// =====================================

app.use(
  "/api/v1/health",
  healthRoutes
);

// Future routes will be registered here.

// =====================================
// ERROR HANDLING
// =====================================

app.use(notFoundHandler);
app.use(errorHandler);

// =====================================
// START SERVER
// =====================================

async function startServer() {
  try {
    await connectDatabases();

    const server = app.listen(
      env.PORT,
      "127.0.0.1",
      () => {
        console.log("");
        console.log("================================");
        console.log("       THIKANAHUB BACKEND");
        console.log("================================");
        console.log("");

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
        console.log("================================");
        console.log(" Server is ready to accept requests");
        console.log("================================");
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

    // Graceful shutdown
    function shutdown() {
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
    console.error(
      "[STARTUP_ERROR] Backend startup failed:",
      error.name
    );

    console.error(
      "[STARTUP_ERROR] Check MongoDB credentials, database permissions and network access."
    );

    await closeDatabases();

    process.exit(1);
  }
}

startServer();