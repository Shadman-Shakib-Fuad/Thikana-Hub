import test from "node:test";
import assert from "node:assert/strict";

import {
  MOBILE_ORIGIN,
  getAllowedOrigins,
  isMobileRequest,
  isTrustedOrigin,
  getMobileBearerToken,
} from "../src/utils/mobile-auth.js";

const WEBSITE = "https://example.com";
const TOKEN = "a".repeat(64);

function request(headers = {}) {
  const values = Object.fromEntries(
    Object.entries(headers).map(
      ([key, value]) => [
        key.toLowerCase(),
        value,
      ]
    )
  );

  return {
    get: (key) => values[key.toLowerCase()],
  };
}

// TEST 1

test("mobile origin disabled by default", () => {
  assert.deepEqual(
    getAllowedOrigins(WEBSITE),
    [WEBSITE]
  );

  assert.equal(
    isTrustedOrigin(
      request({ Origin: MOBILE_ORIGIN }),
      WEBSITE
    ),
    false
  );
});

// TEST 2

test("website origin remains trusted", () => {
  assert.equal(
    isTrustedOrigin(
      request({
        Origin: WEBSITE,
        Cookie: "x=y",
      }),
      WEBSITE
    ),
    true
  );
});

// TEST 3

test("enabled mobile origin is allowed without cookies", () => {
  assert.deepEqual(
    getAllowedOrigins(WEBSITE, true),
    [WEBSITE, MOBILE_ORIGIN]
  );

  assert.equal(
    isMobileRequest(
      request({ Origin: MOBILE_ORIGIN }),
      true
    ),
    true
  );

  assert.equal(
    isTrustedOrigin(
      request({ Origin: MOBILE_ORIGIN }),
      WEBSITE,
      true
    ),
    true
  );
});

// TEST 4

test("untrusted or missing origins are rejected", () => {
  for (const origin of [
    undefined,
    "null",
    "http://localhost",
    "https://localhost.evil.example",
  ]) {
    assert.equal(
      isTrustedOrigin(
        request({ Origin: origin }),
        WEBSITE,
        true
      ),
      false
    );
  }
});

// TEST 5

test("mobile requests cannot use cookie credentials", () => {
  const req = request({
    Origin: MOBILE_ORIGIN,
    Cookie: "x=y",
    Authorization: `Bearer ${TOKEN}`,
  });

  assert.equal(
    isTrustedOrigin(req, WEBSITE, true),
    false
  );

  assert.equal(
    getMobileBearerToken(req, true),
    null
  );
});

// TEST 6

test("valid bearer is accepted only for enabled mobile origin", () => {
  const req = request({
    Origin: MOBILE_ORIGIN,
    Authorization: `Bearer ${TOKEN}`,
  });

  assert.equal(
    getMobileBearerToken(req, true),
    TOKEN
  );

  assert.equal(
    getMobileBearerToken(req),
    null
  );

  assert.equal(
    getMobileBearerToken(
      request({
        Origin: WEBSITE,
        Authorization: `Bearer ${TOKEN}`,
      }),
      true
    ),
    null
  );
});

// TEST 7

test("invalid bearer formats are rejected", () => {
  for (const authorization of [
    undefined,
    "Bearer abc",
    `Basic ${TOKEN}`,
    `Bearer ${"z".repeat(64)}`,
    `Bearer ${TOKEN} `,
  ]) {
    assert.equal(
      getMobileBearerToken(
        request({
          Origin: MOBILE_ORIGIN,
          Authorization: authorization,
        }),
        true
      ),
      null
    );
  }
});