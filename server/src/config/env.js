import "dotenv/config";
import { z } from "zod";

const mongoUriSchema = z
  .string()
  .regex(/^mongodb(\+srv)?:\/\//)
  .refine(
    (value) => !/<[^>]+>|MAIN_PASSWORD|AUDIT_PASSWORD/.test(value)
  );

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),

  PORT: z.coerce
    .number()
    .int()
    .min(1)
    .max(65535)
    .default(5000),

  CLIENT_URL: z.string().url(),

  MONGODB_URI: mongoUriSchema,

  MONGODB_DB_NAME: z.string().min(1),

  AUDIT_MONGODB_URI: mongoUriSchema,

  AUDIT_DB_NAME: z.string().min(1),
});

const result = envSchema.safeParse(process.env);

if (!result.success) {
  const invalidFields = [
    ...new Set(
      result.error.issues.map(
        (issue) => issue.path.join(".")
      )
    ),
  ];

  console.error(
    "[CONFIG] Invalid environment variables:",
    invalidFields.join(", ")
  );

  process.exit(1);
}

if (
  result.data.MONGODB_DB_NAME ===
  result.data.AUDIT_DB_NAME
) {
  console.error(
    "[CONFIG] Main and audit databases must be different."
  );

  process.exit(1);
}

if (
  result.data.MONGODB_URI ===
  result.data.AUDIT_MONGODB_URI
) {
  console.error(
    "[CONFIG] Database connection strings must be separate."
  );

  process.exit(1);
}

export const env = Object.freeze(result.data);