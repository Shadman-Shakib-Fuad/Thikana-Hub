import {
  randomBytes,
  createCipheriv,
  createDecipheriv,
} from "node:crypto";

const ALGORITHM = "aes-256-gcm";

function validateKey(key) {
  if (
    typeof key !== "string" ||
    !/^[a-f0-9]{64}$/i.test(key)
  ) {
    throw new Error("Invalid encryption key.");
  }

  return Buffer.from(key, "hex");
}

// Bind encrypted data to address and owner
export function addressAAD(addressId, ownerId) {
  return JSON.stringify([
    "thikanahub-address-v1",
    String(addressId),
    String(ownerId),
  ]);
}

// Encrypt private data
export function encryptData(value, key, aad) {
  const encryptionKey = validateKey(key);

  const iv = randomBytes(12);

  const cipher = createCipheriv(
    ALGORITHM,
    encryptionKey,
    iv,
    { authTagLength: 16 }
  );

  cipher.setAAD(
    Buffer.from(aad, "utf8")
  );

  const encrypted = Buffer.concat([
    cipher.update(
      JSON.stringify(value),
      "utf8"
    ),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();

  return {
    version: 1,
    algorithm: ALGORITHM,
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
    ciphertext: encrypted.toString("base64"),
  };
}

// Decrypt and verify data integrity
export function decryptData(payload, key, aad) {
  try {
    const encryptionKey = validateKey(key);

    if (
      payload.version !== 1 ||
      payload.algorithm !== ALGORITHM
    ) {
      throw new Error("Invalid payload.");
    }

    const iv = Buffer.from(
      payload.iv,
      "base64"
    );

    const authTag = Buffer.from(
      payload.authTag,
      "base64"
    );

    const ciphertext = Buffer.from(
      payload.ciphertext,
      "base64"
    );

    if (
      iv.length !== 12 ||
      authTag.length !== 16
    ) {
      throw new Error(
        "Invalid encryption metadata."
      );
    }

    const decipher = createDecipheriv(
      ALGORITHM,
      encryptionKey,
      iv,
      { authTagLength: 16 }
    );

    decipher.setAAD(
      Buffer.from(aad, "utf8")
    );

    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);

    return JSON.parse(
      decrypted.toString("utf8")
    );

  } catch {
    throw new Error(
      "Encrypted data integrity verification failed."
    );
  }
}