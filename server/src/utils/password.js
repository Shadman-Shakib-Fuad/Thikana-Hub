import {
  randomBytes,
  scrypt,
  timingSafeEqual,
} from "node:crypto";

import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);

const KEY_LENGTH = 64;

const SCRYPT_OPTIONS = {
  N: 32768,
  r: 8,
  p: 3,
  maxmem: 64 * 1024 * 1024,
};

export async function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");

  const derivedKey = await scryptAsync(
    password,
    salt,
    KEY_LENGTH,
    SCRYPT_OPTIONS
  );

  return [
    "scrypt-v1",
    salt,
    derivedKey.toString("hex"),
  ].join("$");
}

export async function verifyPassword(
  password,
  storedPassword
) {
  if (typeof storedPassword !== "string") {
    return false;
  }

  const [algorithm, salt, storedHash] =
    storedPassword.split("$");

  if (
    algorithm !== "scrypt-v1" ||
    !/^[a-f0-9]{32}$/.test(salt || "") ||
    !/^[a-f0-9]{128}$/.test(storedHash || "")
  ) {
    return false;
  }

  const derivedKey = await scryptAsync(
    password,
    salt,
    KEY_LENGTH,
    SCRYPT_OPTIONS
  );

  const storedBuffer = Buffer.from(
    storedHash,
    "hex"
  );

  return timingSafeEqual(
    storedBuffer,
    derivedKey
  );
}

// Used when an account does not exist,
// to reduce account-discovery timing differences.

const dummyHash = [
  "scrypt-v1",
  "0".repeat(32),
  "0".repeat(128),
].join("$");

export async function verifyDummyPassword(password) {
  await verifyPassword(password, dummyHash);
}