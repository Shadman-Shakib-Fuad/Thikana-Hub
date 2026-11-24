import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

import {
  encryptData,
  decryptData,
  addressAAD,
} from "../src/utils/encryption.js";

const key = randomBytes(32).toString("hex");

const aad = addressAAD(
  "test-address",
  "test-owner"
);

const original = {
  address: "বাসা ১২, কাজীপাড়া, ঢাকা",
  candidates: ["Kazipara"],
};

// Test 1
test("Encrypted address can be decrypted", () => {
  const encrypted = encryptData(
    original, key, aad
  );

  assert.deepEqual(
    decryptData(encrypted, key, aad),
    original
  );
});

// Test 2
test("Fresh IV is generated for each encryption", () => {
  const first = encryptData(
    original, key, aad
  );

  const second = encryptData(
    original, key, aad
  );

  assert.notEqual(first.iv, second.iv);

  assert.notEqual(
    first.ciphertext,
    second.ciphertext
  );
});

// Test 3
test("Wrong encryption key is rejected", () => {
  const encrypted = encryptData(
    original, key, aad
  );

  const wrongKey = randomBytes(32)
    .toString("hex");

  assert.throws(() => {
    decryptData(encrypted, wrongKey, aad);
  });
});

// Test 4
test("Modified ciphertext is rejected", () => {
  const encrypted = encryptData(
    original, key, aad
  );

  const bytes = Buffer.from(
    encrypted.ciphertext,
    "base64"
  );

  bytes[0] ^= 1;

  encrypted.ciphertext =
    bytes.toString("base64");

  assert.throws(() => {
    decryptData(encrypted, key, aad);
  });
});

// Test 5
test("Modified authentication tag is rejected", () => {
  const encrypted = encryptData(
    original, key, aad
  );

  const tag = Buffer.from(
    encrypted.authTag,
    "base64"
  );

  tag[0] ^= 1;

  encrypted.authTag =
    tag.toString("base64");

  assert.throws(() => {
    decryptData(encrypted, key, aad);
  });
});

// Test 6
test("Different address owner is rejected", () => {
  const encrypted = encryptData(
    original, key, aad
  );

  const wrongAAD = addressAAD(
    "test-address",
    "another-owner"
  );

  assert.throws(() => {
    decryptData(encrypted, key, wrongAAD);
  });
});

// Test 7
test("Different address ID is rejected", () => {
  const encrypted = encryptData(
    original, key, aad
  );

  const wrongAAD = addressAAD(
    "another-address",
    "test-owner"
  );

  assert.throws(() => {
    decryptData(encrypted, key, wrongAAD);
  });
});