// Deterministic JSON serialization — recursively sorts object keys
// before stringifying. Needed anywhere a JSON value gets signed/hashed
// and later re-verified after a round trip through Postgres `jsonb`,
// which does not preserve key insertion order or exact formatting.
// Signing/verifying must both canonicalize the same way, or a
// byte-for-byte comparison would fail for a value that is semantically
// identical to what was originally signed (Certificate.payloadJson,
// Module 12).
export function canonicalJsonStringify(value: unknown): string {
  return JSON.stringify(sortKeysDeep(value));
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeysDeep);
  }
  if (value !== null && typeof value === 'object') {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = sortKeysDeep((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}
