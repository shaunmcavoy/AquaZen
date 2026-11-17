// Find your Zen lead intake for AquaZen.
// Saves the lead, emails Shaun the answers and his private recommendation,
// and sends the customer a thank-you that explains why we work this way.
// Secrets: RESEND_API_KEY (required for email), LEAD_TO (optional, defaults to shaun@aquazen.ca).
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const FROM = "Shaun at AquaZen <shaun@mail.aquazen.ca>";
const REPLY_TO = "shaun@aquazen.ca";
const PHONE = "236-304-4424";
const SITE = "https://aquazen.ca";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, authorization, apikey, x-client-info",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

function esc(s: unknown) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

function clip(s: unknown, n: number) {
  return String(s ?? "").trim().slice(0, n);
}

async function sendEmail(key: string, msg: Record<string, unknown>) {
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(msg),
  });
  if (!r.ok) console.error("resend", r.status, await r.text());
  return r.ok;
}

function shell(inner: string) {
  return `<!doctype html><html><body style="margin:0;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif;color:#1d1d1f">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:18px">
<tr><td style="background:#000;border-radius:18px 18px 0 0;padding:28px 32px"><img src="${SITE}/assets/img/logo-full.png" alt="AquaZen" width="120" style="display:block"></td></tr>
<tr><td style="padding:32px;font-size:16px;line-height:1.55">${inner}</td></tr>
</table>
<p style="font-size:12px;color:#86868b;margin:20px 0 0">Aqua Zen Wellness Consulting, operating as AquaZen. 7049 Russell Ave, Burnaby, BC.</p>
</td></tr></table></body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  let b: Record<string, any>;
  try {
    b = await req.json();
  } catch {
    return json({ error: "Invalid request" }, 400);
  }

  // Honeypot: bots fill the hidden website field. Pretend it worked.
  if (clip(b.website, 200)) return json({ ok: true });

  const first = clip(b.first_name, 80);
  const last = clip(b.last_name, 80);
  const email = clip(b.email, 200).toLowerCase();
  const phone = clip(b.phone, 40);
  const city = clip(b.city, 80);
  const bestTime = clip(b.best_time, 20);
  const rec = clip(b.recommendation, 500);
  const answers = typeof b.answers === "object" && b.answers ? b.answers : {};
  const readable: Record<string, string> = typeof b.readable === "object" && b.readable ? b.readable : {};

  if (!first) return json({ error: "First name is required" }, 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "A valid email is required" }, 400);
  if (phone.replace(/\D/g, "").length < 10) return json({ error: "A phone number is required" }, 400);

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: row, error } = await db.from("leads").insert({
    first_name: first, last_name: last || null, email, phone, city: city || null,
    best_time: bestTime || null, answers, recommendation: rec || null,
    email_ok: !!b.email_ok, newsletter: !!b.newsletter,
  }).select("id").single();
  if (error) {
    console.error("insert", error);
    return json({ error: "Could not save" }, 500);
  }

  // The dashboard secret was saved as RESENC_API_KEY; accept either name.
  const key = Deno.env.get("RESEND_API_KEY") || Deno.env.get("RESENC_API_KEY");
  if (!key) {
    console.error("RESEND_API_KEY not set; lead saved without emails", row.id);
    return json({ ok: true, emailed: false });
  }

  const to = Deno.env.get("LEAD_TO") || "shaun@aquazen.ca";
  const name = [first, last].filter(Boolean).join(" ");
  const rows = Object.entries(readable).map(([q, a]) =>
    `<tr><td style="padding:8px 0;border-top:1px solid #eee;color:#6e6e73;vertical-align:top;width:45%">${esc(q)}</td><td style="padding:8px 0 8px 12px;border-top:1px solid #eee;font-weight:600">${esc(a)}</td></tr>`
  ).join("");

  const staff = shell(`
<h1 style="font-size:24px;margin:0 0 6px">New Find your Zen lead</h1>
<p style="margin:0 0 20px;color:#6e6e73">Call ${esc(first)}${bestTime ? ` (best time: ${esc(bestTime)})` : ""} and book a quiet visit.</p>
<p style="margin:0 0 4px;font-size:20px;font-weight:700">${esc(name)}</p>
<p style="margin:0"><a href="tel:${esc(phone.replace(/[^\d+]/g, ""))}" style="color:#347c6e">${esc(phone)}</a> &nbsp; <a href="mailto:${esc(email)}" style="color:#347c6e">${esc(email)}</a></p>
${city ? `<p style="margin:4px 0 0;color:#6e6e73">${esc(city)}</p>` : ""}
${rec ? `<div style="margin:24px 0;padding:16px 18px;background:#eef6f2;border-radius:12px"><strong>Suggested starting point (only you see this):</strong><br>${esc(rec)}</div>` : ""}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:15px">${rows}</table>
<p style="margin:20px 0 0;font-size:13px;color:#6e6e73">Emails about their search: ${b.email_ok ? "yes" : "no"}. AquaZen notes: ${b.newsletter ? "yes" : "no"}.</p>`);

  const customer = shell(`
<h1 style="font-size:24px;margin:0 0 16px">Thank you, ${esc(first)}.</h1>
<p style="margin:0 0 14px">I've got your answers, and I'll call you${bestTime && bestTime !== "Any time" ? ` in the ${esc(bestTime.toLowerCase())}` : ""} to book a quiet visit to the showroom.</p>
<p style="margin:0 0 14px">Here's why I start with questions instead of a sales pitch. People don't really want a hot tub. They want a place of peace: twenty minutes a night where the phones stay inside and you can actually breathe and talk to the people you love. The right tub is the one that fits how you'll use it, not the biggest one on the floor.</p>
<p style="margin:0 0 14px">So I read every answer myself. When we talk, I'll tell you honestly what I'd choose for your family, even if it's the smaller tub. I'd rather you love it for years than overspend.</p>
<p style="margin:0 0 24px">Can't wait for my call? Call or text me any time at <a href="tel:+12363044424" style="color:#347c6e">${PHONE}</a>, or just reply to this email.</p>
<p style="margin:0">Talk soon,<br><strong>Shaun McAvoy</strong><br>AquaZen, 7049 Russell Ave, Burnaby</p>`);

  await Promise.all([
    sendEmail(key, { from: FROM, to: [to], reply_to: email, subject: `New lead: ${name}${city ? `, ${city}` : ""}`, html: staff }),
    sendEmail(key, { from: FROM, to: [email], reply_to: REPLY_TO, subject: "Thanks for finding your Zen with AquaZen", html: customer }),
  ]);

  return json({ ok: true });
});
