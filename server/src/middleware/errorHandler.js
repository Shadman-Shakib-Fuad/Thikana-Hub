// Handle unknown API endpoints
export function notFoundHandler(req, res) {
  return res.status(404).json({
    success: false,
    code: "NOT_FOUND",
    message: "The requested endpoint was not found.",
    requestId: req.requestId,
  });
}

// Centralized error handler
export function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }

  // Oversized request
  if (err.type === "entity.too.large") {
    return res.status(413).json({
      success: false,
      code: "PAYLOAD_TOO_LARGE",
      message: "Request payload is too large.",
      requestId: req.requestId,
    });
  }

  // Invalid JSON
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({
      success: false,
      code: "INVALID_JSON",
      message: "Invalid JSON request.",
      requestId: req.requestId,
    });
  }

  // Safe internal error logging
  console.error(
    `[INTERNAL_SERVER_ERROR] Request ID: ${req.requestId}`
  );

  return res.status(500).json({
    success: false,
    code: "INTERNAL_SERVER_ERROR",
    message: "Something went wrong. Please try again.",
    requestId: req.requestId,
  });
}