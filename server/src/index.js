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
  notFoundHandler,
  errorHandler,
} from "./middleware/errorHandler.js";

import healthRoutes from "./routes/health.routes.js";
import authRoutes from "./routes/auth.routes.js";
import addressRoutes from "./routes/address.routes.js";
import merchantRoutes from "./routes/merchant.routes.js";

const app = express();

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
    ],

    exposedHeaders: [
      "X-Request-ID",
    ],
  })
);

// =====================================
// GLOBAL RATE LIMITING
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

// =====================================
// REQUEST PARSERS
// =====================================

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
  return res.status(200).json({
    success: true,

    application: "ThikanaHub",

    description:
      "Bangla Address Resolution Engine",

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

app.use(
  "/api/v1/auth",
  authRoutes
);

app.use(
  "/api/v1",
  addressRoutes
);

// =====================================
// ERROR HANDLING
// =====================================

app.use("/api/v1", merchantRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

// =====================================
// STARTUP ERROR DIAGNOSTICS
// =====================================

function logStartupError(error) {
  console.error("");

  console.error("================================");
  console.error("     BACKEND STARTUP ERROR");
  console.error("================================");

  console.error(
    "[STARTUP_ERROR]",
    error.name || "UnknownError"
  );

  console.error(
    "[ERROR_CODE]",
    error.code || error.cause?.code || "N/A"
  );

  console.error(
    "[DATABASE_TOPOLOGY]",
    error.reason?.type || "N/A"
  );

  const servers =
    error.reason?.servers?.values?.() || [];

  let serverNumber = 0;

  for (const server of servers) {
    serverNumber++;

    console.error(
      `\n[DATABASE_SERVER_${serverNumber}]`
    );

    console.error(
      "Server Type:",
      server.type || "Unknown"
    );

    console.error(
      "Server Error:",
      server.error?.name || "N/A"
    );

    console.error(
      "Server Code:",
      server.error?.code ||
      server.error?.cause?.code ||
      "N/A"
    );
  }

  if (error.name === "MongoServerSelectionError") {
    console.error("");

    console.error(
      "[SUGGESTION] Check MongoDB Atlas cluster status."
    );

    console.error(
      "[SUGGESTION] Check Atlas IP Access List."
    );

    console.error(
      "[SUGGESTION] Check network, DNS and TLS connection."
    );
  }

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

        console.log(
          "[AUTH] Authentication API ready"
        );

        console.log(
          "[SECURITY] Security middleware active"
        );

        console.log(
          "[CRYPTO] Encryption service configured"
        );

        console.log(
          "[ADDRESS] Address Resolution API ready"
        );

        console.log("================================");
      }
    );

    // Server listening error
    server.on("error", async (error) => {
      console.error(
        "[SERVER_ERROR]",
        error.code || "UNKNOWN_ERROR"
      );

      await closeDatabases();

      process.exit(1);
    });

    // Graceful server shutdown
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