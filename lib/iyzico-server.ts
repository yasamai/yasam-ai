import "server-only";

import crypto from "node:crypto";

const apiKey = process.env.IYZICO_API_KEY || "";
const secretKey = process.env.IYZICO_SECRET_KEY || "";
const baseUrl = (process.env.IYZICO_BASE_URL || "https://sandbox-api.iyzipay.com").replace(/\/$/, "");

function requireIyzicoEnv() {
  if (!apiKey || !secretKey) throw new Error("IYZICO_API_KEY veya IYZICO_SECRET_KEY eksik.");
}

function randomKey() {
  return `${Date.now()}${crypto.randomBytes(8).toString("hex")}`;
}

function authorization(path: string, body = "") {
  requireIyzicoEnv();
  const rnd = randomKey();
  const pathname = path.split("?")[0];
  const signature = crypto.createHmac("sha256", secretKey).update(rnd + pathname + body).digest("hex");
  const encoded = Buffer.from(`apiKey:${apiKey}&randomKey:${rnd}&signature:${signature}`, "utf8").toString("base64");
  return { rnd, value: `IYZWSv2 ${encoded}` };
}

async function parseJson(response: Response) {
  return response.json().catch(() => ({} as Record<string, unknown>));
}

export async function iyzicoPost(path: string, payload: unknown) {
  const body = JSON.stringify(payload);
  const auth = authorization(path, body);
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      Authorization: auth.value,
      "x-iyzi-rnd": auth.rnd,
      "Content-Type": "application/json",
    },
    body,
    cache: "no-store",
  });
  return { response, data: await parseJson(response) as any };
}

export async function iyzicoGet(path: string) {
  const auth = authorization(path, "");
  const response = await fetch(`${baseUrl}${path}`, {
    method: "GET",
    headers: {
      Authorization: auth.value,
      "x-iyzi-rnd": auth.rnd,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });
  return { response, data: await parseJson(response) as any };
}

export function verifyIyzicoSubscriptionWebhook(input: {
  signature: string;
  merchantId: string;
  eventType: string;
  subscriptionReferenceCode: string;
  orderReferenceCode: string;
  customerReferenceCode: string;
}) {
  requireIyzicoEnv();
  const message =
    input.merchantId +
    secretKey +
    input.eventType +
    input.subscriptionReferenceCode +
    input.orderReferenceCode +
    input.customerReferenceCode;
  const expected = crypto.createHmac("sha256", secretKey).update(message).digest("hex").toLowerCase();
  const received = input.signature.trim().toLowerCase();
  if (!received || expected.length !== received.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected, "utf8"), Buffer.from(received, "utf8"));
}
