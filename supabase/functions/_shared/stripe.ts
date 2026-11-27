// Stripe card payments (Stripe Checkout, Stripe's hosted payment page).
// The secret key lives only in the function secret STRIPE_SECRET_KEY. The webhook signing secret is created by
// stripeSetupWebhook() and kept in the server-only settings table (stripe_webhook_secret).

const API = "https://api.stripe.com/v1";

function key(): string {
  const k = Deno.env.get("STRIPE_SECRET_KEY");
  if (!k) throw new Error("STRIPE_SECRET_KEY is not set");
  return k;
}

// Stripe takes form-encoded bodies with bracketed keys, e.g. line_items[0][price_data][currency].
function form(obj: Record<string, unknown>, prefix = "", out = new URLSearchParams()): URLSearchParams {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const name = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) v.forEach((x, i) => typeof x === "object" ? form(x as Record<string, unknown>, `${name}[${i}]`, out) : out.append(`${name}[${i}]`, String(x)));
    else if (typeof v === "object") form(v as Record<string, unknown>, name, out);
    else out.append(name, String(v));
  }
  return out;
}

// deno-lint-ignore no-explicit-any
export async function stripe(path: string, body?: Record<string, unknown>, method = body ? "POST" : "GET"): Promise<any> {
  const res = await fetch(`${API}/${path}`, {
    method,
    headers: { Authorization: `Bearer ${key()}`, ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}) },
    body: body ? form(body) : undefined,
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`stripe ${res.status}: ${j?.error?.message ?? "request failed"}`);
  return j;
}

export const cents = (n: number) => Math.round(Number(n) * 100);

// A Checkout Session for one payment in Canadian dollars. Card only (Apple Pay and Google Pay ride on card).
export function startCheckout(o: { amount: number; name: string; description: string; email?: string; successUrl: string; cancelUrl: string; metadata: Record<string, string> }) {
  return stripe("checkout/sessions", {
    mode: "payment",
    payment_method_types: ["card"],
    customer_email: o.email || undefined,
    line_items: [{ quantity: 1, price_data: { currency: "cad", unit_amount: cents(o.amount), product_data: { name: o.name, description: o.description } } }],
    payment_intent_data: { description: o.description, metadata: o.metadata },
    metadata: o.metadata,
    success_url: o.successUrl,
    cancel_url: o.cancelUrl,
  });
}

// The session with its payment and card details, so we can check it ourselves before marking anything paid.
export function getSession(id: string) {
  return stripe(`checkout/sessions/${encodeURIComponent(id)}?expand[]=payment_intent.latest_charge`);
}

// Verify a webhook: Stripe signs "timestamp.payload" with HMAC SHA-256. Reject anything older than 5 minutes.
export async function verifyWebhook(payload: string, header: string | null, secret: string): Promise<boolean> {
  if (!header || !secret) return false;
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=", 2) as [string, string]));
  const t = parts.t, v1s = header.split(",").filter((p) => p.startsWith("v1=")).map((p) => p.slice(3));
  if (!t || !v1s.length || Math.abs(Date.now() / 1000 - Number(t)) > 300) return false;
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(`${t}.${payload}`)));
  const hex = Array.from(mac).map((b) => b.toString(16).padStart(2, "0")).join("");
  return v1s.some((v) => {
    if (v.length !== hex.length) return false;
    let d = 0; for (let i = 0; i < hex.length; i++) d |= hex.charCodeAt(i) ^ v.charCodeAt(i);
    return d === 0;
  });
}

// Create (or recreate) the webhook endpoint that tells us about payments, and return its signing secret.
export async function setupWebhook(url: string): Promise<{ id: string; secret: string; livemode: boolean }> {
  const list = await stripe("webhook_endpoints?limit=100");
  // deno-lint-ignore no-explicit-any
  for (const w of (list.data ?? []) as any[]) if (w.url === url) await stripe(`webhook_endpoints/${w.id}`, undefined, "DELETE");
  const w = await stripe("webhook_endpoints", {
    url, description: "AquaZen pay page",
    enabled_events: ["checkout.session.completed", "checkout.session.async_payment_succeeded", "payment_intent.payment_failed"],
  });
  return { id: w.id, secret: w.secret, livemode: !!w.livemode };
}
