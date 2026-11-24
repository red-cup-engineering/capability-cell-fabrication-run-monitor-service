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

export async function admitOcapnSturdyRef({
  authorization,
  admissionUrl,
  appendAdmission,
  fetchImpl = fetch,
}) {
  const match = CAPABILITY.exec(authorization ?? "");
  if (!match) return deny();
  if (typeof admissionUrl !== "string" || admissionUrl.trim() === ""
      || typeof appendAdmission !== "function") {
    return unavailable("OCapNAdmissionProviderUnavailable");
  }
  let response;
  try {
    response = await fetchImpl(admissionUrl, {
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
  let admission;
  try {
    admission = await response.json();
  } catch {
    return unavailable("OCapNAdmissionProviderUnavailable");
  }
  if (admission?.admitted !== true) return deny();
  try {
    await appendAdmission({
      type: "OCapNAdmissionReceipt",
      operation: "observe-capability-cell-fabrication-run",
      admission,
    });
  } catch {
    return unavailable("OCapNAdmissionReceiptUnavailable");
  }
  return { admitted: true };
}
