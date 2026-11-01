import { CLOUD_EVENT_MEDIA_TYPE, toObservationCloudEvent } from "./cloud-events.mjs";

/** Opt-in HTTP content negotiation; wildcard Accept never changes the legacy
 * x402 result shape. RFC 9110 quality=0 explicitly refuses this media type.
 */
export function acceptsCloudEventJson(acceptHeader) {
  if (typeof acceptHeader !== "string") return false;
  return acceptHeader.split(",").some((mediaRange) => {
    const [mediaType, ...parameters] = mediaRange.split(";");
    if (mediaType.trim().toLowerCase() !== CLOUD_EVENT_MEDIA_TYPE) return false;
    for (const parameter of parameters) {
      if (!/^\s*q\s*=/iu.test(parameter)) continue;
      const match = /^\s*q\s*=\s*(0(?:\.[0-9]{0,3})?|1(?:\.0{0,3})?)\s*$/iu.exec(parameter);
      if (!match || Number(match[1]) === 0) return false;
    }
    return true;
  });
}

/** Preserve the existing JSON response unless a caller explicitly requests
 * CloudEvents and a genuinely recorded successful observation exists.
 */
export function representPaidObservationResponse({ status, body }, acceptHeader, { source } = {}) {
  if (status === 200
      && body?.terminal?.type === "X402PaidFabricationRunObservationReceipt"
      && body.terminal.result?.type === "CapabilityCellFabricationRunObservation"
      && acceptsCloudEventJson(acceptHeader)) {
    return { status: 200, contentType: CLOUD_EVENT_MEDIA_TYPE,
      body: toObservationCloudEvent(body.terminal.result, { source }) };
  }
  return { status, contentType: "application/json", body };
}
