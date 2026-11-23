// Helcim: card payments on the customer's own device through HelcimPay.js.
// Flow: the server starts a checkout session (amount fixed here, never by the browser), the pay page opens
// Helcim's card form with the checkoutToken, and when Helcim says SUCCESS the page sends the result back.
// We then look the transaction up with Helcim ourselves before marking anything paid.
// The API token lives only in the HELCIM_API_TOKEN function secret.

const API = "https://api.helcim.com/v2";

function apiToken() {
  const t = Deno.env.get("HELCIM_API_TOKEN");
  if (!t) throw new Error("Card payments aren't set up yet. Call or text Shaun at 236-304-4424.");
  return t;
}

async function call(method: "GET" | "POST", path: string, body?: unknown) {
  const res = await fetch(API + path, {
    method,
    headers: { accept: "application/json", "content-type": "application/json", "api-token": apiToken() },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  // deno-lint-ignore no-explicit-any
  let data: any = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!res.ok) {
    const msg = Array.isArray(data.errors) ? data.errors.join(", ") : typeof data.errors === "string" ? data.errors : JSON.stringify(data.errors ?? data);
    console.error("helcim", method, path, res.status, msg);
    throw new Error(`Helcim ${res.status}: ${msg}`);
  }
  return data;
}

// Starts a card checkout for exactly this amount (CAD). Tokens last 60 minutes.
export async function startCheckout(amount: number): Promise<{ checkoutToken: string; secretToken: string }> {
  const r = await call("POST", "/helcim-pay/initialize", {
    paymentType: "purchase",
    amount: Math.round(amount * 100) / 100,
    currency: "CAD",
    paymentMethod: "cc",
    confirmationScreen: false,
  });
  if (!r.checkoutToken || !r.secretToken) throw new Error("Helcim didn't return a checkout session.");
  return { checkoutToken: String(r.checkoutToken), secretToken: String(r.secretToken) };
}

// The transaction as Helcim has it: status APPROVED or DECLINED, amount, type, card details.
// deno-lint-ignore no-explicit-any
export async function getTransaction(id: string | number): Promise<any> {
  return await call("GET", `/card-transactions/${encodeURIComponent(String(id))}`);
}

// Helcim signs the browser result: sha256(JSON of data + secretToken), hex. A second check on top of
// looking the transaction up, so a mismatch is logged rather than trusted either way.
export async function hashMatches(data: unknown, hash: string, secretToken: string) {
  const bytes = new TextEncoder().encode(JSON.stringify(data) + secretToken);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  const hex = Array.from(digest).map((b) => b.toString(16).padStart(2, "0")).join("");
  return hex === String(hash ?? "").toLowerCase();
}
