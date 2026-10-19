// The x402 provider returns an RFC 6920 SHA-256 NI URI, not a sha256:hex
// string. The public result route carries only its canonical 43-character
// base64url digest; reconstruction does not change the payment identity.
const NI_PREFIX = "ni:///sha-256;";
const DIGEST = /^[A-Za-z0-9_-]{43}$/u;

function canonicalDigest(value) {
  return typeof value === "string" && DIGEST.test(value)
    && Buffer.from(value, "base64url").length === 32
    && Buffer.from(value, "base64url").toString("base64url") === value;
}

export function paidObservationResultReference(invocation) {
  if (typeof invocation !== "string" || !invocation.startsWith(NI_PREFIX)) {
    throw new TypeError("paid observation requires one canonical RFC 6920 SHA-256 invocation identity");
  }
  const digest = invocation.slice(NI_PREFIX.length);
  if (!canonicalDigest(digest)) {
    throw new TypeError("paid observation invocation has an invalid SHA-256 NI digest");
  }
  return digest;
}

export function paidObservationInvocationFromReference(reference) {
  return canonicalDigest(reference) ? `${NI_PREFIX}${reference}` : null;
}
