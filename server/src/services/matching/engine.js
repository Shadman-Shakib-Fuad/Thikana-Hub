import {
  normalizeAddress,
  validateAddress
} from "./normalizer.js";

// Levenshtein distance
export function levenshteinDistance(first, second) {
  const a = Array.from(first);
  const b = Array.from(second);

  let previous = Array.from(
    { length: b.length + 1 },
    (_, i) => i
  );

  for (let i = 1; i <= a.length; i++) {
    const current = [i];

    for (let j = 1; j <= b.length; j++) {
      const cost =
        a[i - 1] === b[j - 1] ? 0 : 1;

      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + cost
      );
    }

    previous = current;
  }

  return previous[b.length];
}

// Calculate spelling similarity
export function calculateSimilarity(first, second) {
  const a = normalizeAddress(first);
  const b = normalizeAddress(second);

  const length = Math.max(
    Array.from(a).length,
    Array.from(b).length
  );

  return length === 0
    ? 1
    : 1 - levenshteinDistance(a, b) / length;
}

// Exact locality and alias matching
function hasExactMatch(address, names) {
  return names.some(name => {
    const phrase = normalizeAddress(name);

    return phrase &&
      ` ${address} `.includes(` ${phrase} `);
  });
}

// Fuzzy spelling matching
function bestFuzzyMatch(address, names) {
  const tokens = address.split(" ");

  let best = 0;

  for (const name of names) {
    const phrase = normalizeAddress(name);

    const length = Array.from(phrase).length;

    if (length < 5 || /\p{N}/u.test(phrase)) {
      continue;
    }

    const size = phrase.split(" ").length;

    const maxDistance = Math.min(
      2,
      Math.floor(length * 0.2)
    );

    for (let i = 0; i <= tokens.length - size; i++) {
      const part = tokens
        .slice(i, i + size)
        .join(" ");

      if (/\p{N}/u.test(part)) {
        continue;
      }

      if (
        Math.abs(Array.from(part).length - length) >
        maxDistance
      ) {
        continue;
      }

      if (
        levenshteinDistance(part, phrase) > maxDistance
      ) {
        continue;
      }

      best = Math.max(
        best,
        calculateSimilarity(part, phrase)
      );
    }
  }

  return best;
}

// Determine matching evidence
function getEvidence(address, locality) {
  const names = [
    locality.nameEn,
    locality.nameBn,
    ...(locality.aliases || [])
  ].filter(Boolean);

  if (hasExactMatch(address, names)) {
    return {
      score: 75,
      type: "exact",
      reason: "Exact locality or alias match"
    };
  }

  if (hasExactMatch(address, locality.landmarks || [])) {
    return {
      score: 65,
      type: "landmark",
      reason: "Recognized landmark"
    };
  }

  const similarity = bestFuzzyMatch(address, names);

  return similarity >= 0.8
    ? {
        score: 55 + Math.round(similarity * 10),
        type: "fuzzy",
        reason: "Similar locality spelling"
      }
    : null;
}

function districtNames(locality) {
  return [
    locality.districtEn,
    locality.districtBn,
    ...(locality.districtAliases || [])
  ];
}

// Main address resolution engine
export function resolveAddress(address, localities) {
  const validation = validateAddress(address);

  if (!validation.valid) {
    return {
      success: false,
      status: "invalid_input",
      message: validation.message,
      candidates: []
    };
  }

  if (!Array.isArray(localities)) {
    throw new TypeError(
      "Locality dataset must be an array."
    );
  }

  const normalized = validation.normalized;

  const districtMentioned = localities.some(
    item => hasExactMatch(
      normalized,
      districtNames(item)
    )
  );

  const candidates = [];

  for (const locality of localities) {
    const evidence = getEvidence(
      normalized,
      locality
    );

    if (!evidence) continue;

    let score = evidence.score;

    const reasons = [evidence.reason];

    // District-based ranking
    if (
      hasExactMatch(
        normalized,
        districtNames(locality)
      )
    ) {
      score += 15;
      reasons.push("District matched");

    } else if (districtMentioned) {
      score -= 20;

      reasons.push(
        "Different district from the address"
      );
    }

    // Area-based ranking
    if (
      hasExactMatch(normalized, [
        locality.areaEn,
        locality.areaBn,
        ...(locality.areaAliases || [])
      ])
    ) {
      score += 10;
      reasons.push("Area matched");
    }

    candidates.push({
      localityId: locality.id,

      locality: {
        nameEn: locality.nameEn,
        nameBn: locality.nameBn,

        areaEn: locality.areaEn,
        areaBn: locality.areaBn,

        districtEn: locality.districtEn,
        districtBn: locality.districtBn,

        divisionEn: locality.divisionEn,
        divisionBn: locality.divisionBn
      },

      score: Math.max(
        0,
        Math.min(100, score)
      ),

      matchType: evidence.type,

      reasons
    });
  }

  // Rank candidates
  const rank = (a, b) =>
    b.score - a.score ||
    String(a.localityId).localeCompare(
      String(b.localityId)
    );

  candidates.sort(rank);

  const results = [
    ...candidates.filter(
      c => c.matchType !== "fuzzy"
    ),

    ...candidates.filter(
      c => c.matchType === "fuzzy" &&
      c.score >= 60
    ).slice(0, 10)
  ].sort(rank);

  // Unknown address
  if (!results.length) {
    return {
      success: true,
      status: "no_confident_match",
      message: "No confident locality match was found.",
      requiresConfirmation: false,
      ambiguous: false,
      candidates: []
    };
  }

  const ambiguous =
    results.length > 1 &&
    results[0].score - results[1].score <= 10;

  return {
    success: true,

    status: "needs_review",

    message: ambiguous
      ? "Multiple possible localities found."
      : "Review and confirm a suggested locality.",

    requiresConfirmation: true,

    ambiguous,

    candidates: results
  };
}