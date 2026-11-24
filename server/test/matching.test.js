import test from "node:test";
import assert from "node:assert/strict";

import {
  normalizeAddress,
  validateAddress
} from "../src/services/matching/normalizer.js";

import {
  resolveAddress,
  levenshteinDistance,
  calculateSimilarity
} from "../src/services/matching/engine.js";

// Test-only locality dataset
// Not an approved geographic database.

const localities = [
  {
    id: "TEST-001",
    nameEn: "Kazipara",
    nameBn: "কাজীপাড়া",
    areaEn: "Mirpur",
    areaBn: "মিরপুর",
    districtEn: "Dhaka",
    districtBn: "ঢাকা",
    divisionEn: "Dhaka",
    divisionBn: "ঢাকা",
    aliases: ["Kazi Para", "কাজিপাড়া"],
    districtAliases: ["Dacca"],
    landmarks: ["Kazipara Metro Station"]
  },

  {
    id: "TEST-002",
    nameEn: "Shantipur",
    nameBn: "শান্তিপুর",
    areaEn: "Example Area A",
    districtEn: "Dhaka",
    districtBn: "ঢাকা"
  },

  {
    id: "TEST-003",
    nameEn: "Shantipur",
    nameBn: "শান্তিপুর",
    areaEn: "Example Area B",
    districtEn: "Cumilla",
    districtBn: "কুমিল্লা",
    districtAliases: ["Comilla"]
  },

  {
    id: "TEST-004",
    nameEn: "Sector 10",
    nameBn: "সেক্টর ১০",
    areaEn: "Uttara",
    areaBn: "উত্তরা",
    districtEn: "Dhaka",
    districtBn: "ঢাকা"
  },

  {
    id: "TEST-005",
    nameEn: "Sector 11",
    nameBn: "সেক্টর ১১",
    areaEn: "Uttara",
    areaBn: "উত্তরা",
    districtEn: "Dhaka",
    districtBn: "ঢাকা"
  }
];

const resolve = address =>
  resolveAddress(address, localities);

// Test 01
test("Bangla digits are normalized", () => {
  assert.equal(
    normalizeAddress("বাসা ১২, রোড ৫"),
    "বাসা 12 রোড 5"
  );
});

// Test 02
test("Uppercase and punctuation are normalized", () => {
  assert.equal(
    normalizeAddress("DHAKA,   MIRPUR!!!"),
    "dhaka mirpur"
  );
});

// Test 03
test("Empty address is rejected", () => {
  assert.equal(
    validateAddress("   ").valid,
    false
  );
});

// Test 04
test("Oversized address is rejected", () => {
  assert.equal(
    validateAddress("a".repeat(301)).valid,
    false
  );
});

// Test 05
test("Invalid address type is rejected", () => {
  assert.equal(
    validateAddress({ address: "Dhaka" }).valid,
    false
  );
});

// Test 06
test("Symbol-only input is rejected", () => {
  assert.equal(
    validateAddress("!@#$%^ ").valid,
    false
  );
});

// Test 07
test("Levenshtein distance works", () => {
  assert.equal(
    levenshteinDistance("kazipra", "kazipara"),
    1
  );
});

// Test 08
test("Exact strings have full similarity", () => {
  assert.equal(
    calculateSimilarity("Dhaka", "dhaka"),
    1
  );
});

// Test 09
test("Exact English address is resolved", () => {
  const result = resolve(
    "Kazipara, Mirpur, Dhaka"
  );

  assert.equal(
    result.candidates[0].localityId,
    "TEST-001"
  );

  assert.equal(
    result.candidates[0].score,
    100
  );
});

// Test 10
test("Bangla address is resolved", () => {
  assert.equal(
    resolve("কাজীপাড়া, মিরপুর, ঢাকা")
      .candidates[0].localityId,
    "TEST-001"
  );
});

// Test 11
test("Mixed-language address is resolved", () => {
  assert.equal(
    resolve("বাসা ১২, Kazipara, মিরপুর, Dhaka")
      .candidates[0].localityId,
    "TEST-001"
  );
});

// Test 12
test("Alias is recognized", () => {
  assert.equal(
    resolve("Kazi Para, Mirpur, Dacca")
      .candidates[0].score,
    100
  );
});

// Test 13
test("Spelling mistake uses fuzzy matching", () => {
  const result = resolve(
    "Kazipra, Mirpur, Dhaka"
  );

  assert.equal(
    result.candidates[0].localityId,
    "TEST-001"
  );

  assert.equal(
    result.candidates[0].matchType,
    "fuzzy"
  );
});

// Test 14
test("Duplicate locality names remain visible", () => {
  const result = resolve("Shantipur");

  assert.equal(
    result.candidates.length,
    2
  );

  assert.equal(
    result.ambiguous,
    true
  );
});

// Test 15
test("District improves candidate ranking", () => {
  const result = resolve(
    "Shantipur, Cumilla"
  );

  assert.equal(
    result.candidates[0].localityId,
    "TEST-003"
  );

  assert.equal(
    result.candidates.length,
    2
  );
});

// Test 16
test("Unknown address has no confident match", () => {
  const result = resolve(
    "Xyzqwv Unknown Place"
  );

  assert.equal(
    result.status,
    "no_confident_match"
  );

  assert.equal(
    result.candidates.length,
    0
  );
});

// Test 17
test("Numbered localities are not confused", () => {
  const result = resolve(
    "Sector 10, Uttara, Dhaka"
  );

  assert.equal(
    result.candidates[0].localityId,
    "TEST-004"
  );

  assert.equal(
    result.candidates.some(
      c => c.localityId === "TEST-005"
    ),
    false
  );
});

// Test 18
test("Even exact matches require confirmation", () => {
  const result = resolve(
    "Kazipara, Mirpur, Dhaka"
  );

  assert.equal(
    result.requiresConfirmation,
    true
  );

  assert.equal(
    result.status,
    "needs_review"
  );
});

// Test 19
test("No exact house coordinates are invented", () => {
  const result = resolve(
    "House 12, Kazipara, Mirpur, Dhaka"
  );

  assert.equal(
    result.candidates[0].locality.latitude,
    undefined
  );

  assert.equal(
    result.candidates[0].locality.longitude,
    undefined
  );
});