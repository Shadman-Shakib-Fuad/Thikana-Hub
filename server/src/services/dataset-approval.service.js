import { isDeepStrictEqual } from "node:util";
import { z } from "zod";

import { getMainDB } from "../config/database.js";

const NAME_FIELDS = [
  "nameEn",
  "nameBn",
  "areaEn",
  "areaBn",
  "districtEn",
  "districtBn",
  "divisionEn",
  "divisionBn",
];

const TERM_FIELDS = [
  "aliases",
  "areaAliases",
  "districtAliases",
  "landmarks",
];

const COLLECTIONS = {
  locality: "locality_proposals",
  term: "locality_term_proposals",
};

const nameSchema = z.string()
  .trim()
  .min(1)
  .max(120)
  .refine(value => !/[\p{Cc}]/u.test(value));

const localitySchema = z.object(
  Object.fromEntries(
    NAME_FIELDS.map(field => [field, nameSchema])
  )
).strict();

const idSchema = z.string()
  .regex(/^[A-Z0-9-]{4,128}$/);

const termSchema = nameSchema.refine(
  value => /[\p{L}\p{N}]/u.test(normalizeTerm(value))
);

export class DatasetApprovalError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = "DatasetApprovalError";
    this.status = status;
    this.code = code;
  }
}

function fail(status, code, message) {
  throw new DatasetApprovalError(status, code, message);
}

function conflict() {
  fail(
    409,
    "DATASET_VERSION_CONFLICT",
    "The dataset changed after this proposal was submitted."
  );
}

function invalidProposal() {
  fail(
    409,
    "INVALID_STORED_PROPOSAL",
    "The stored proposal cannot be safely published."
  );
}

export function proposalCollection(kind) {
  if (!Object.hasOwn(COLLECTIONS, kind)) {
    fail(400, "INVALID_PROPOSAL_KIND", "Invalid proposal kind.");
  }

  return getMainDB().collection(COLLECTIONS[kind]);
}

function normalizeTerm(value) {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[০-৯]/g, digit =>
      String("০১২৩৪৫৬৭৮৯".indexOf(digit))
    )
    .replace(/\p{Cf}/gu, "")
    .replace(/[\p{P}\p{S}]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function snapshot(record) {
  return Object.fromEntries(
    NAME_FIELDS.map(field => [
      field,
      record[field] ?? "",
    ])
  );
}

function stringArray(value) {
  return Array.isArray(value) &&
    value.every(item => typeof item === "string");
}

function nextTimestamp(record) {
  const previous = record?.updatedAt instanceof Date
    ? record.updatedAt.getTime()
    : 0;

  return new Date(
    Math.max(Date.now(), previous + 1)
  );
}

// =====================================
// UNIQUE LOCALITY ID INDEX
// =====================================

let indexPromise = null;

async function initializeApprovalIndex() {
  if (!indexPromise) {
    indexPromise = (async () => {
      const localities = getMainDB().collection("localities");

      const indexes = await localities.indexes();

      const existing = indexes.find(index =>
        index.unique === true &&
        index.key?.id === 1 &&
        Object.keys(index.key).length === 1 &&
        !index.sparse &&
        !index.partialFilterExpression &&
        (!index.collation ||
          index.collation.locale === "simple")
      );

      if (!existing) {
        await localities.createIndex(
          { id: 1 },
          {
            name: "dataset_approval_unique_locality_id",
            unique: true,
            collation: { locale: "simple" },
          }
        );
      }
    })().catch(error => {
      indexPromise = null;
      throw error;
    });
  }

  await indexPromise;
}

// =====================================
// PUBLIC PROPOSAL REPRESENTATION
// =====================================

export function publicProposal(kind, record, admin = false) {
  return {
    proposalId: String(record._id),

    kind,

    localityId: record.localityId,

    operation: record.operation,

    ...(kind === "locality"
      ? {
          locality: record.locality,
          baseLocality: record.baseLocality ?? null,
        }
      : {
          field: record.field,
          term: record.term,
          baseTerms: record.baseTerms ?? [],
        }),

    ...(admin
      ? { requestedBy: String(record.requestedBy) }
      : {}),

    reason: record.reason,

    evidence: record.evidence,

    status: record.status,

    decision: record.approvalDecision
      ? {
          action: record.approvalDecision.action,
          reason: record.approvalDecision.reason,
          decidedAt: record.approvalDecision.decidedAt,
          published: record.approvalDecision.published,

          ...(admin
            ? {
                decidedBy: String(
                  record.approvalDecision.decidedBy
                ),
              }
            : {}),
        }
      : null,

    createdAt: record.createdAt,

    updatedAt: record.updatedAt,
  };
}

// =====================================
// NEW LOCALITY PUBLICATION
// =====================================

async function publishCreate(proposal, localities, session) {
  const parsed = localitySchema.safeParse(proposal.locality);

  if (!parsed.success ||
      !idSchema.safeParse(proposal.localityId).success) {
    invalidProposal();
  }

  const exists = await localities.findOne(
    { id: proposal.localityId },
    { session }
  );

  if (exists) {
    fail(
      409,
      "LOCALITY_ALREADY_EXISTS",
      "The proposed locality ID is already in use."
    );
  }

  // Reuse the current dataset's locality-level precision
  // convention only if it is consistent and supported.

  const precisions = await localities.distinct(
    "precision",
    { approved: true },
    { session }
  );

  const samples = await localities.find(
    { approved: true },
    { session }
  ).limit(1001).toArray();

  const datasetVersion = samples[0]?.datasetVersion;

  const validDatasetVersion =
    (
      typeof datasetVersion === "string" &&
      datasetVersion.trim().length > 0
    ) ||
    (
      Number.isSafeInteger(datasetVersion) &&
      datasetVersion >= 0
    );

  const supportedFields = new Set([
    "datasetVersion",
    "_id",
    "id",
    ...NAME_FIELDS,
    ...TERM_FIELDS,
    "approved",
    "source",
    "precision",
    "createdAt",
    "updatedAt",
  ]);

  if (
    !validDatasetVersion ||
    samples.length === 0 ||
    samples.length > 1000 ||
    precisions.length !== 1 ||
    typeof precisions[0] !== "string" ||
    !precisions[0].trim() ||
    samples.some(record =>
      record.datasetVersion !== datasetVersion ||
      typeof record.source !== "string" ||
      record.precision !== precisions[0] ||
      !NAME_FIELDS.every(field =>
        typeof record[field] === "string"
      ) ||
      !TERM_FIELDS.every(field =>
        stringArray(record[field])
      ) ||
      Object.keys(record).some(field =>
        !supportedFields.has(field)
      )
    )
  ) {
    fail(
      409,
      "UNSUPPORTED_DATASET_TEMPLATE",
      "The locality creation template requires manual verification."
    );
  }

  const now = new Date();

  await localities.insertOne(
    {
      id: proposal.localityId,

      ...parsed.data,

      aliases: [],
      areaAliases: [],
      districtAliases: [],
      landmarks: [],

      approved: true,

      source: `Admin-approved proposal ${proposal._id}`,

      precision: precisions[0],

      datasetVersion,

      createdAt: now,
      updatedAt: now,
    },
    { session }
  );
}

// =====================================
// EXISTING LOCALITY UPDATE
// =====================================

async function publishUpdate(proposal, localities, session) {
  const parsed = localitySchema.safeParse(proposal.locality);

  if (
    !parsed.success ||
    !idSchema.safeParse(proposal.localityId).success
  ) {
    invalidProposal();
  }

  const record = await localities.findOne(
    {
      id: proposal.localityId,
      approved: true,
    },
    { session }
  );

  if (!record) {
    conflict();
  }

  if (
    !isDeepStrictEqual(
      snapshot(record),
      proposal.baseLocality
    ) ||
    !isDeepStrictEqual(
      record.updatedAt ?? null,
      proposal.baseUpdatedAt ?? null
    )
  ) {
    conflict();
  }

  if (isDeepStrictEqual(snapshot(record), parsed.data)) {
    fail(
      409,
      "NO_DATASET_CHANGE",
      "The proposal does not contain a locality change."
    );
  }

  const result = await localities.updateOne(
    {
      _id: record._id,
      approved: true,
    },

    {
      $set: {
        ...parsed.data,
        updatedAt: nextTimestamp(record),
      },
    },

    { session }
  );

  if (result.modifiedCount !== 1) {
    conflict();
  }
}

// =====================================
// ALIAS AND LANDMARK PUBLICATION
// =====================================

async function publishTerm(proposal, localities, session) {
  if (
    !idSchema.safeParse(proposal.localityId).success ||
    !TERM_FIELDS.includes(proposal.field) ||
    !["add", "remove"].includes(proposal.operation) ||
    !termSchema.safeParse(proposal.term).success
  ) {
    invalidProposal();
  }

  const record = await localities.findOne(
    {
      id: proposal.localityId,
      approved: true,
    },

    { session }
  );

  if (!record) {
    conflict();
  }

  const existing = record[proposal.field];

  if (
    String(record._id) !==
      String(proposal.baseLocalityDocumentId) ||
    !stringArray(existing) ||
    !isDeepStrictEqual(existing, proposal.baseTerms) ||
    !isDeepStrictEqual(
      record.updatedAt ?? null,
      proposal.baseUpdatedAt ?? null
    )
  ) {
    conflict();
  }

  const normalized = normalizeTerm(proposal.term);

  if (normalized !== proposal.normalizedTerm) {
    invalidProposal();
  }

  const matches = existing.filter(
    term => normalizeTerm(term) === normalized
  );

  let next;

  if (proposal.operation === "add") {
    if (matches.length > 0) {
      conflict();
    }

    if (existing.length >= 200) {
      fail(
        409,
        "TERM_LIMIT_REACHED",
        "The locality term limit has been reached."
      );
    }

    next = [...existing, proposal.term];

  } else {
    if (matches.length !== 1) {
      conflict();
    }

    next = existing.filter(
      term => normalizeTerm(term) !== normalized
    );
  }

  const result = await localities.updateOne(
    {
      _id: record._id,
      approved: true,
    },

    {
      $set: {
        [proposal.field]: next,
        updatedAt: nextTimestamp(record),
      },
    },

    { session }
  );

  if (result.modifiedCount !== 1) {
    conflict();
  }
}

// =====================================
// TRANSACTIONAL APPROVAL OR REJECTION
// =====================================

export async function decideDatasetProposal({
  kind,
  proposalId,
  adminId,
  action,
  reason,
}) {
  const db = getMainDB();

  const proposals = proposalCollection(kind);
  const localities = db.collection("localities");

  if (!["approve", "reject"].includes(action)) {
    fail(400, "INVALID_ACTION", "Invalid decision action.");
  }

  if (
    typeof reason !== "string" ||
    reason.trim().length < 10 ||
    reason.length > 1000
  ) {
    fail(400, "INVALID_REASON", "Invalid decision reason.");
  }

  if (action === "approve") {
    await initializeApprovalIndex();
  }

  const session = db.client.startSession();

  try {
    const result = await session.withTransaction(
      async () => {
        const proposal = await proposals.findOne(
          { _id: proposalId },
          { session }
        );

        if (!proposal) {
          fail(
            404,
            "PROPOSAL_NOT_FOUND",
            "The proposal was not found."
          );
        }

        if (proposal.status !== "pending") {
          fail(
            409,
            "PROPOSAL_ALREADY_DECIDED",
            "The proposal has already been decided."
          );
        }

        if (
          String(proposal.requestedBy) === String(adminId)
        ) {
          fail(
            403,
            "SELF_APPROVAL_FORBIDDEN",
            "An administrator cannot decide their own proposal."
          );
        }

        const admin = await db.collection("users").findOne(
          {
            _id: adminId,
            role: "admin",
            status: "active",
          },
          {
            session,
            projection: { _id: 1 },
          }
        );

        if (!admin) {
          fail(
            403,
            "ADMIN_NOT_ACTIVE",
            "An active administrator is required."
          );
        }

        if (action === "approve") {
          if (kind === "term") {
            await publishTerm(
              proposal,
              localities,
              session
            );

          } else if (proposal.operation === "create") {
            await publishCreate(
              proposal,
              localities,
              session
            );

          } else if (proposal.operation === "update") {
            await publishUpdate(
              proposal,
              localities,
              session
            );

          } else {
            invalidProposal();
          }
        }

        const now = new Date();

        const status = action === "approve"
          ? "approved"
          : "rejected";

        const approvalDecision = {
          action,
          reason: reason.trim(),
          decidedBy: adminId,
          decidedAt: now,
          published: action === "approve",
        };

        const updated = await proposals.updateOne(
          {
            _id: proposalId,
            status: "pending",
          },

          {
            $set: {
              status,
              approvalDecision,
              updatedAt: now,
            },
          },

          { session }
        );

        if (updated.modifiedCount !== 1) {
          conflict();
        }

        return {
          ...proposal,
          status,
          approvalDecision,
          updatedAt: now,
        };
      },

      {
        readConcern: { level: "snapshot" },
        writeConcern: { w: "majority" },
        readPreference: "primary",
      }
    );

    return result;

  } catch (error) {
    if (error?.code === 11000) {
      fail(
        409,
        "DATASET_DUPLICATE_CONFLICT",
        "A conflicting dataset record already exists."
      );
    }

    throw error;

  } finally {
    await session.endSession();
  }
}
