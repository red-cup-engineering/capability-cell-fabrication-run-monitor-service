#!/usr/bin/env node

import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";
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

async function appendReceipt(path, record) {
  await mkdir(dirname(path), { recursive: true });
  await appendFile(path, `${JSON.stringify(record)}\n`, { encoding: "utf8", mode: 0o600 });
}

async function receiptState(path) {
  let source;
  try {
    source = await readFile(path, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return { intents: new Map(), terminal: new Map() };
    throw error;
  }
  const records = source.split("\n").filter(Boolean).map((line) => JSON.parse(line));
  return {
    intents: new Map(records
      .filter((record) => record?.type === "X402PaidFabricationRunObservationIntent")
      .map((record) => [record.invocation, record])),
    terminal: new Map(records
      .filter((record) => [
        "X402PaidFabricationRunObservationReceipt",
        "X402PaidFabricationRunObservationRefusal",
      ].includes(record?.type))
      .map((record) => [record.invocation, record])),
  };
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
  const pending = new Map(recovered.intents);
  const terminal = new Map(recovered.terminal);
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
    afterSettle: async (event) => {
      const settlementEvidence = x402SettlementEvidence(event);
      const invocation = settlementEvidence.invocation;
      const intent = pending.get(invocation);
      if (!intent) throw new Error("settled payment has no exact observation intent");
      let record;
      try {
        record = {
          type: "X402PaidFabricationRunObservationReceipt",
          invocation,
          settlement: settlementEvidence,
          pricing: priced.result,
          result: observeCapabilityCellFabricationRun(intent.request),
        };
      } catch (error) {
        record = {
          type: "X402PaidFabricationRunObservationRefusal",
          invocation,
          settlement: settlementEvidence,
          pricing: priced.result,
          refusal: error instanceof FabricationRunObservationRefusal
            ? error.toJSON()
            : { type: "CapabilityCellFabricationRunObservationRefusal", code: "execution-error", reason: error.message },
        };
      }
      terminal.set(invocation, record);
      await appendReceipt(receiptPath, record);
    },
  });
  const app = express();
  app.set("trust proxy", "loopback");
  app.use(express.json({ limit: process.env.JSON_BODY_LIMIT ?? "128mb" }));
  app.get("/x402/capability-cell-fabrication-run-monitor/offer", (_request, response) => {
    response.json({ ...offer, pricing: priced.result });
  });
  app.post(resource, async (request, response, next) => {
    try {
      const authorization = request.get("authorization") ?? "";
      const matched = /^OCapN (urn:ocapn:sturdyref:[A-Za-z0-9_-]{43})$/u.exec(authorization);
      if (!matched) throw new Error("one OCapN sturdy reference is required");
      const admitted = await fetch(required("OCAPN_ADMISSION_URL"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sturdyRef: matched[1],
          locus: "observe-capability-cell-fabrication-run",
        }),
      }).then((result) => result.json());
      if (admitted?.admitted !== true) {
        throw new Error(`OCapN provider refused: ${admitted?.reason ?? "unknown"}`);
      }
      await appendReceipt(receiptPath, {
        type: "OCapNAdmissionReceipt",
        operation: "observe-capability-cell-fabrication-run",
        admission: admitted,
      });
      next();
    } catch (error) {
      response.status(403).json({
        ok: false,
        refusal: { type: "OCapNSturdyRefAdmissionRefusal", reason: error.message },
      });
    }
  });
  app.use(boundary.middleware);
  app.post(resource, async (request, response) => {
    const invocation = x402PaymentIdentity(request.get("payment-signature"));
    const intent = {
      type: "X402PaidFabricationRunObservationIntent",
      invocation,
      request: structuredClone(request.body),
    };
    pending.set(invocation, intent);
    await appendReceipt(receiptPath, intent);
    response.status(202).json({
      ok: true,
      invocation,
      status: "settlement-pending",
      result: `/x402/capability-cell-fabrication-run-monitor/result/${invocation.slice(7)}`,
    });
  });
  app.get("/x402/capability-cell-fabrication-run-monitor/result/:id", (request, response) => {
    if (!/^[0-9a-f]{64}$/u.test(request.params.id)) {
      return response.status(400).json({ ok: false, refusal: { type: "InvalidInvocationIdentity" } });
    }
    const invocation = `sha256:${request.params.id}`;
    const isTerminal = terminal.has(invocation);
    return response.status(isTerminal ? 200 : 202).json({
      ok: true,
      invocation,
      status: isTerminal ? "terminal" : "pending",
      terminal: terminal.get(invocation) ?? null,
    });
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
