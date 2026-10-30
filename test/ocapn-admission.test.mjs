import assert from "node:assert/strict";
import test from "node:test";
import { admitOcapnSturdyRef } from "../src/ocapn-admission.mjs";

const authorization = "OCapN urn:ocapn:sturdyref:" + "A".repeat(43);
const admissionUrl = "http://127.0.0.1:18893/ocapn/admit";
function fixture(response = { ok: true, status: 200, json: async () => ({ admitted: true }) }) {
  const calls = [];
  const records = [];
  return {
    calls,
    records,
    options: {
      authorization, admissionUrl,
      fetchImpl: async (...args) => { calls.push(args); return response; },
      appendAdmission: async (value) => { records.push(value); },
    },
  };
}

test("missing or malformed sturdy reference refuses without contacting the provider", async () => {
  for (const value of ["", "Bearer invalid", "OCapN urn:ocapn:sturdyref:bad", null]) {
    const f = fixture();
    const result = await admitOcapnSturdyRef({ ...f.options, authorization: value });
    assert.equal(result.status, 403);
    assert.equal(result.refusal.type, "OCapNSturdyRefAdmissionRefusal");
    assert.deepEqual(f.calls, []);
    assert.deepEqual(f.records, []);
  }
});

test("a positive provider admission gets one durable original receipt before continuation", async () => {
  const f = fixture();
  const result = await admitOcapnSturdyRef(f.options);
  assert.deepEqual(result, { admitted: true });
  assert.equal(f.calls.length, 1);
  const [url, request] = f.calls[0];
  assert.equal(url, f.options.admissionUrl);
  assert.equal(request.method, "POST");
  assert.deepEqual(JSON.parse(request.body), {
    sturdyRef: authorization.slice(6), locus: "observe-capability-cell-fabrication-run",
  });
  assert.deepEqual(f.records, [{
    type: "OCapNAdmissionReceipt",
    operation: "observe-capability-cell-fabrication-run",
    admission: { admitted: true },
  }]);
});

test("explicit denial never becomes a paid attempt and never reveals provider explanation", async () => {
  const secret = "internal principal and issuer";
  const f = fixture({ ok: true, status: 200, json: async () => ({ admitted: false, reason: secret }) });
  const result = await admitOcapnSturdyRef(f.options);
  assert.equal(result.status, 403);
  assert.equal(JSON.stringify(result).includes(secret), false);
  assert.deepEqual(f.records, []);
});

test("provider authorization HTTP 401 and 403 are bounded denials", async () => {
  for (const status of [401, 403]) {
    const f = fixture({ ok: false, status, json: async () => ({ admitted: false }) });
    const result = await admitOcapnSturdyRef(f.options);
    assert.equal(result.status, 403);
    assert.deepEqual(f.records, []);
  }
});

test("provider server failure, transport failure and JSON failure are unavailable, not denied", async () => {
  const f = fixture({ ok: false, status: 503 });
  const server = await admitOcapnSturdyRef(f.options);
  assert.equal(server.status, 503);
  assert.equal(server.refusal.type, "OCapNAdmissionProviderUnavailable");
  const transport = await admitOcapnSturdyRef({
    ...f.options,
    fetchImpl: async () => { throw new Error("secret credential in upstream failure"); },
  });
  assert.equal(transport.status, 503);
  assert.equal(JSON.stringify(transport).includes("secret"), false);
  const malformed = await admitOcapnSturdyRef({
    ...f.options,
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError("private dump"); } }),
  });
  assert.equal(malformed.status, 503);
  assert.deepEqual(f.records, []);
});

test("missing provider configuration is an outage and cannot append authorization", async () => {
  const f = fixture();
  const result = await admitOcapnSturdyRef({ ...f.options, admissionUrl: "" });
  assert.equal(result.status, 503);
  assert.equal(f.calls.length, 0);
  assert.deepEqual(f.records, []);
});

test("receipt append failure prevents admission and reports storage outage instead of 403", async () => {
  const f = fixture();
  const result = await admitOcapnSturdyRef({
    ...f.options, appendAdmission: async () => { throw new Error("ENOSPC /private/secrets"); },
  });
  assert.equal(result.status, 503);
  assert.equal(result.refusal.type, "OCapNAdmissionReceiptUnavailable");
  assert.equal(JSON.stringify(result).includes("private"), false);
});

test("an unadmitted provider response and missing append never grant continuation", async () => {
  const f = fixture({ ok: true, status: 200, json: async () => ({ note: "provider did not decide" }) });
  assert.equal((await admitOcapnSturdyRef(f.options)).status, 403);
  assert.deepEqual(f.records, []);
  assert.equal((await admitOcapnSturdyRef({ ...fixture().options, appendAdmission: null })).status, 503);
});
