#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { admitOcapnSturdyRef } from "../src/ocapn-admission.mjs";
import { appendReceipt, receiptState } from "../src/paid-observation-journal.mjs";
import { createPaidObservationLedger } from "../src/paid-observation-ledger.mjs";
import { paidObservationResultReference, paidObservationInvocationFromReference } from "../src/paid-observation-identity.mjs";
import express from "express";
import {
  createExactEvmPaymentBoundary,
  x402PaymentIdentity,
  x402SettlementEvidence,
} from "@red-cup-engineering/x402-services-section";
import { FabricationRunObservationRefusal, observeCapabilityCellFabricationRun } from "../src/observe.mjs";

function required(name) {
  const value = process.env[name];
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${name} is required`);
  return value;
}

async function jsonFile(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function quote() {
  const response = await fetch(required("PRICE_QUOTE_URL"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(await jsonFile(required("PRICE_QUOTE_DEMAND"))),
  });
  const body = await response.json();
  if (!response.ok || body?.ok !== true) {
    throw new Error(`pricing provider refused: ${body?.refusal?.message ?? response.status}`);
  }
  const amount = body.result?.consideration?.amount;
  if (amount?.denominator !== "1" || !/^[1-9][0-9]*$/u.test(amount.numerator ?? "")) {
    throw new Error("x402 requires a positive integer number of atomic settlement units");
  }
  return Object.freeze({ result: body.result, atomicAmount: amount.numerator });
}

export async function main() {
  const network = required("SETTLEMENT_CAIP2");
  const settlement = required("SETTLEMENT_ACCOUNT");
  const asset = required("X402_ASSET");
  const resource = "/x402/capability-cell-fabrication-run-monitor/invoke";
  const receiptPath = required("X402_RECEIPT_PATH");
  const priced = await quote();
  const offer = await jsonFile(required("CAPABILITY_OFFER_PATH"));
  if (offer.price.amount !== priced.atomicAmount || offer.price.network !== network
      || offer.price.asset.toLowerCase() !== asset.toLowerCase()
      || offer.price.payTo?.toLowerCase() !== settlement.split(":").at(-1).toLowerCase()) {
    throw new Error("published offer drifted from the hired pricing provider");
  }
  const recovered = await receiptState(receiptPath);
  const ledger = createPaidObservationLedger({
    intents: recovered.intents,
    terminals: recovered.terminals,
    append: (record) => appendReceipt(receiptPath, record),
    observe: observeCapabilityCellFabricationRun,
    projectRefusal: (error) => error instanceof FabricationRunObservationRefusal
      ? error.toJSON()
      : {
        type: "CapabilityCellFabricationRunObservationRefusal",
        code: "execution-error",
        reason: error instanceof Error ? error.message : String(error),
      },
    pricing: priced.result,
  });
  const boundary = createExactEvmPaymentBoundary({
    network,
    facilitatorUrl: required("X402_FACILITATOR_URL"),
    routes: {
      [`POST ${resource}`]: {
        accepts: [{
          scheme: "exact",
          network,
          price: {
            amount: priced.atomicAmount,
            asset,
            extra: {
              name: required("X402_ASSET_NAME"),
              version: required("X402_ASSET_VERSION"),
            },
          },
          payTo: settlement.split(":").at(-1),
        }],
        description: "Observe one append-only Capability Cell fabrication run trajectory.",
      },
    },
    afterSettle: async (event) => ledger.settle(x402SettlementEvidence(event)),
  });
  const app = express();
  app.set("trust proxy", "loopback");
  app.use(express.json({ limit: process.env.JSON_BODY_LIMIT ?? "128mb" }));
  app.get("/x402/capability-cell-fabrication-run-monitor/offer", (_request, response) => {
    response.json({ ...offer, pricing: priced.result });
  });
  app.post(resource, async (request, response, next) => {
    const outcome = await admitOcapnSturdyRef({
      authorization: request.get("authorization"),
      admissionUrl: process.env.OCAPN_ADMISSION_URL,
      appendAdmission: (record) => appendReceipt(receiptPath, record),
    });
    if (!outcome.admitted) {
      return response.status(outcome.status).json({ ok: false, refusal: outcome.refusal });
    }
    return next();
  });
  // Retain the signed invocation before the payment middleware may settle it.
  // An unsigned 402 challenge must not create an apparent paid operation.
  app.post(resource, async (request, response, next) => {
    const signature = request.get("payment-signature");
    if (!signature) return next();
    let invocation;
    try {
      invocation = x402PaymentIdentity(signature);
      // An unsupported signed-identity format is a bad caller request.
      paidObservationResultReference(invocation);
    } catch {
      return response.status(400).json({
        ok: false,
        refusal: { type: "X402PaidFabricationRunObservationIntentRefusal" },
      });
    }
    try {
      // Source-owned journal retention must finish before settlement.
      await ledger.retain(invocation, request.body);
    } catch (error) {
      if (error?.code === "invocation-payload-conflict") {
        return response.status(409).json({
          ok: false,
          refusal: { type: "X402PaidFabricationRunObservationIntentRefusal" },
        });
      }
      // Disk or journal errors are service unavailability, NOT a bad
      // signature, authorization denial or fabricated pending purchase.
      return response.status(503).json({
        ok: false,
        refusal: { type: "X402PaidFabricationRunObservationIntentUnavailable" },
      });
    }
    return next();
  });
  app.use(boundary.middleware);
  app.post(resource, (request, response) => {
    const invocation = x402PaymentIdentity(request.get("payment-signature"));
    const reading = ledger.read(invocation);
    if (reading.status === 404) throw new Error("payment invocation has no matching durable intent");
    return response.status(reading.status).json({
      ok: true,
      invocation,
      status: reading.status === 200 ? "terminal" : "intent-recorded",
      result: `/x402/capability-cell-fabrication-run-monitor/result/${paidObservationResultReference(invocation)}`,
    });
  });
  app.get("/x402/capability-cell-fabrication-run-monitor/result/:id", (request, response) => {
    const invocation = paidObservationInvocationFromReference(request.params.id);
    if (!invocation) {
      return response.status(400).json({ ok: false, refusal: { type: "InvalidInvocationIdentity" } });
    }
    const reading = ledger.read(invocation);
    return response.status(reading.status).json(reading.body);
  });
  const host = process.env.HOST ?? "127.0.0.1";
  const port = Number(process.env.PORT ?? "15635");
  app.listen(port, host, () => process.stdout.write(`${JSON.stringify({
    type: "CapabilityCellFabricationRunMonitorX402Listening",
    host,
    port,
    network,
    atomicAmount: priced.atomicAmount,
  })}\n`));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exitCode = 1;
  });
}
