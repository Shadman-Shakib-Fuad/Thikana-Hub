import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

const BASE_URL =
  "http://127.0.0.1:5000/api/v1/auth";

const ORIGIN =
  "http://localhost:3000";

const testUser = {
  name: "ThikanaHub Test User",

  email:
    `test-${randomBytes(6).toString("hex")}@example.com`,

  password:
    randomBytes(24).toString("hex"),
};

let sessionCookie = "";

async function request(
  endpoint,
  {
    method = "GET",
    body,
    cookie,
    origin = ORIGIN,
  } = {}
) {
  const response = await fetch(
    `${BASE_URL}${endpoint}`,
    {
      method,

      headers: {
        "Content-Type": "application/json",

        ...(origin
          ? { Origin: origin }
          : {}),

        ...(cookie
          ? { Cookie: cookie }
          : {}),
      },

      ...(body
        ? {
            body: JSON.stringify(body),
          }
        : {}),
    }
  );

  const data = await response.json();

  return {
    response,
    data,
  };
}

async function runTests() {
  console.log("");
  console.log("THIKANAHUB AUTHENTICATION TEST");
  console.log("================================");

  // TEST 1: Registration

  const registration = await request(
    "/register",
    {
      method: "POST",
      body: testUser,
    }
  );

  assert.equal(
    registration.response.status,
    201
  );

  assert.equal(
    registration.data.user.role,
    "merchant"
  );

  assert.equal(
    registration.data.user.passwordHash,
    undefined
  );

  console.log("[PASS] User registration");

  // TEST 2: Duplicate email

  const duplicate = await request(
    "/register",
    {
      method: "POST",
      body: testUser,
    }
  );

  assert.equal(
    duplicate.response.status,
    409
  );

  console.log("[PASS] Duplicate email rejected");

  // TEST 3: Role manipulation

  const roleAttack = await request(
    "/register",
    {
      method: "POST",
      body: {
        ...testUser,
        role: "admin",
      },
    }
  );

  assert.equal(
    roleAttack.response.status,
    400
  );

  console.log("[PASS] Role manipulation rejected");

  // TEST 4: Incorrect password

  const wrongPassword = await request(
    "/login",
    {
      method: "POST",
      body: {
        email: testUser.email,
        password: "incorrect-password",
      },
    }
  );

  assert.equal(
    wrongPassword.response.status,
    401
  );

  console.log("[PASS] Invalid password rejected");

  // TEST 5: Successful login

  const login = await request(
    "/login",
    {
      method: "POST",
      body: {
        email: testUser.email,
        password: testUser.password,
      },
    }
  );

  assert.equal(
    login.response.status,
    200
  );

  const setCookie =
    login.response.headers.get("set-cookie");

  assert.ok(setCookie);

  assert.match(
    setCookie,
    /HttpOnly/i
  );

  sessionCookie =
    setCookie.split(";")[0];

  console.log("[PASS] Secure session cookie issued");

  // TEST 6: Current user

  const currentUser = await request(
    "/me",
    {
      cookie: sessionCookie,
    }
  );

  assert.equal(
    currentUser.response.status,
    200
  );

  assert.equal(
    currentUser.data.user.email,
    testUser.email
  );

  console.log("[PASS] Authenticated user verified");

  // TEST 7: Unauthorized request

  const unauthorized =
    await request("/me");

  assert.equal(
    unauthorized.response.status,
    401
  );

  console.log("[PASS] Unauthenticated access denied");

  // TEST 8: Merchant accessing admin API

  const adminAccess = await request(
    "/admin-check",
    {
      cookie: sessionCookie,
    }
  );

  assert.equal(
    adminAccess.response.status,
    403
  );

  console.log("[PASS] Unauthorized admin access denied");

  // TEST 9: Untrusted request origin

  const untrustedOrigin = await request(
    "/logout",
    {
      method: "POST",
      cookie: sessionCookie,
      origin: "https://untrusted.example",
    }
  );

  assert.equal(
    untrustedOrigin.response.status,
    403
  );

  console.log("[PASS] Untrusted origin rejected");

  // TEST 10: Logout

  const logout = await request(
    "/logout",
    {
      method: "POST",
      cookie: sessionCookie,
    }
  );

  assert.equal(
    logout.response.status,
    200
  );

  console.log("[PASS] Logout successful");

  // TEST 11: Reusing revoked session

  const revokedSession = await request(
    "/me",
    {
      cookie: sessionCookie,
    }
  );

  assert.equal(
    revokedSession.response.status,
    401
  );

  console.log("[PASS] Revoked session rejected");

  console.log("================================");
  console.log("ALL 11 AUTHENTICATION TESTS PASSED");
  console.log("================================");
}

runTests().catch((error) => {
  console.error(
    "[TEST FAILED]",
    error.code || error.name
  );

  if (error.code === "ERR_ASSERTION") {
    console.error(
      "Expected:",
      error.expected,
      "Actual:",
      error.actual
    );
  }

  process.exitCode = 1;
});