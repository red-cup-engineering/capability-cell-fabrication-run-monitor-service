// The original x402 seller's OCapN pre-payment gate. Keep authentication
// refusal separate from unavailable upstream proof and unavailable durable
// admission journaling. Neither failure path may activate paid middleware.
const CAPABILITY = /^OCapN (urn:ocapn:sturdyref:[A-Za-z0-9_-]{43})$/u;
const deny = () => ({
  admitted: false,
  status: 403,
  refusal: { type: "OCapNSturdyRefAdmissionRefusal" },
});
const unavailable = (type) => ({
  admitted: false,
  status: 503,
  refusal: { type },
});

export async function validateOcapnSturdyRef({
  authorization,
  admissionUrl: validationUrl,
  appendAdmission: appendValidation,
  fetchImpl = fetch,
}) {
  const match = CAPABILITY.exec(authorization ?? "");
  if (!match) return deny();
  if (typeof validationUrl !== "string" || validationUrl.trim() === ""
      || typeof appendValidation !== "function") {
    return unavailable("OCapNAdmissionProviderUnavailable");
  }
  let response;
  try {
    response = await fetchImpl(validationUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sturdyRef: match[1],
        locus: "observe-capability-cell-fabrication-run",
      }),
    });
  } catch {
    return unavailable("OCapNAdmissionProviderUnavailable");
  }
  if (!response?.ok) {
    return response?.status === 401 || response?.status === 403
      ? deny() : unavailable("OCapNAdmissionProviderUnavailable");
  }
  let validation;
  try {
    validation = await response.json();
  } catch {
    return unavailable("OCapNAdmissionProviderUnavailable");
  }
  if (validation?.admitted !== true) return deny();
  try {
    await appendValidation({
      type: "OCapNAdmissionReceipt",
      operation: "observe-capability-cell-fabrication-run",
      admission: validation,
    });
  } catch {
    return unavailable("OCapNAdmissionReceiptUnavailable");
  }
  return { admitted: true };
}
