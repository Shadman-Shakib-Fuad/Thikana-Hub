import { ObjectId } from "mongodb";

import {
  getMainDB,
} from "../config/database.js";

const QUERY_TIMEOUT = 5000;

// =====================================
// SAFE USER PROJECTION
// =====================================

const USER_PROJECTION = {
  _id: 1,
  name: 1,
  email: 1,
  role: 1,
  status: 1,
  createdAt: 1,
  updatedAt: 1,
  lastLoginAt: 1,
};

function dateString(value) {
  if (
    value instanceof Date &&
    Number.isFinite(value.getTime())
  ) {
    return value.toISOString();
  }

  return null;
}

function safeUser(user) {
  return {
    userId: String(user._id),

    name: user.name,

    email: user.email,

    role: user.role,

    status: user.status,

    createdAt:
      dateString(user.createdAt),

    updatedAt:
      dateString(user.updatedAt),

    lastLoginAt:
      dateString(user.lastLoginAt),
  };
}

// =====================================
// LITERAL SEARCH PROTECTION
// =====================================

function escapeRegex(value) {
  return value.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );
}

// =====================================
// USER DIRECTORY
// =====================================

export async function listAdminUsers({
  q,
  role,
  status,
  limit,
  cursor,
}) {
  const users = getMainDB()
    .collection("users");

  const filter = {};

  if (role !== "all") {
    filter.role = role;
  }

  if (status !== "all") {
    filter.status = status;
  }

  if (q) {
    const search = escapeRegex(q);

    filter.$or = [
      {
        name: {
          $regex: search,
          $options: "i",
        },
      },
      {
        email: {
          $regex: search,
          $options: "i",
        },
      },
    ];
  }

  if (cursor) {
    filter._id = {
      $lt: new ObjectId(cursor),
    };
  }

  const records = await users
    .find(filter, {
      projection: USER_PROJECTION,

      maxTimeMS: QUERY_TIMEOUT,
    })
    .sort({ _id: -1 })
    .limit(limit + 1)
    .toArray();

  const hasMore =
    records.length > limit;

  const page =
    records.slice(0, limit);

  return {
    items: page.map(safeUser),

    pagination: {
      limit,

      hasMore,

      nextCursor:
        hasMore
          ? String(page[page.length - 1]._id)
          : null,
    },
  };
}

// =====================================
// INDIVIDUAL USER DETAILS
// =====================================

async function findUser(userId) {
  return getMainDB()
    .collection("users")
    .findOne(
      {
        _id: new ObjectId(userId),
      },
      {
        projection: USER_PROJECTION,

        maxTimeMS: QUERY_TIMEOUT,
      }
    );
}

export async function getAdminUser(userId) {
  const user = await findUser(userId);

  return user
    ? safeUser(user)
    : null;
}

// =====================================
// ROLE ASSIGNMENT ELIGIBILITY
// =====================================

export async function getRoleEligibility(
  userId,
  administratorId
) {
  const user = await findUser(userId);

  if (!user) {
    return null;
  }

  const result = {
    userId: String(user._id),

    currentRole: user.role,

    currentStatus: user.status,

    eligible: false,

    allowedRoles: [],

    reasonCode: null,
  };

  if (
    String(user._id) ===
    String(administratorId)
  ) {
    result.reasonCode =
      "SELF_ROLE_CHANGE_FORBIDDEN";

    return result;
  }

  if (user.status !== "active") {
    result.reasonCode =
      "ACCOUNT_NOT_ACTIVE";

    return result;
  }

  if (user.role !== "merchant") {
    result.reasonCode =
      "ACCOUNT_NOT_MERCHANT";

    return result;
  }

  const existingAddress =
    await getMainDB()
      .collection("address_requests")
      .findOne(
        {
          ownerId: user._id,
        },
        {
          projection: {
            _id: 1,
          },

          maxTimeMS: QUERY_TIMEOUT,
        }
      );

  if (existingAddress) {
    result.reasonCode =
      "ACCOUNT_HAS_ADDRESS_RECORDS";

    return result;
  }

  result.eligible = true;

  result.allowedRoles = [
    "reviewer",
    "data_manager",
  ];

  return result;
}
