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

// Hot tubs Find your Zen may show; the browser sends their slugs and we only trust these.
const TUBS: Record<string, [string, string, string]> = {
  brook: ["Brook", "series-one", "Series One"], zephyr: ["Zephyr", "series-one", "Series One"],
  cypress: ["Cypress", "series-one", "Series One"], cove: ["Cove", "series-one", "Series One"],
  sierra: ["Sierra", "series-two", "Series Two"], harmony: ["Harmony", "series-two", "Series Two"],
  eden: ["Eden", "series-two", "Series Two"], aspen: ["Aspen", "series-two", "Series Two"],
  calma: ["Calma", "series-two", "Series Two"], cascade: ["Cascade", "series-three", "Series Three"],
  serenity: ["Serenity", "series-three", "Series Three"], zenith: ["Zenith", "series-three", "Series Three"],
  solstice: ["Solstice", "series-three", "Series Three"],
};

function pickCard(slug: string, label: string) {
  const [name, series, seriesName] = TUBS[slug];
  const url = `${SITE}/hot-tubs/${series}/${slug}/`;
  return `<td width="50%" valign="top" style="padding:0 6px">
<a href="${url}" style="text-decoration:none;color:#1d1d1f"><img src="${SITE}/assets/img/email/${slug}.jpg" alt="The ${name}" width="230" style="display:block;width:100%;max-width:230px;height:auto;border-radius:12px;background:#f5f5f7">
<p style="margin:10px 0 2px;font-size:12px;font-weight:600;color:#347c6e">${label}</p>
<p style="margin:0;font-size:18px;font-weight:700">The ${name}</p>
<p style="margin:2px 0 0;font-size:13px;color:#6e6e73">${seriesName}</p></a></td>`;
}

function shell(inner: string) {
  return `<!doctype html><html><body style="margin:0;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif;color:#1d1d1f">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:18px">
<tr><td style="background:#ffffff;border-radius:18px 18px 0 0;padding:28px 32px 20px;border-bottom:1px solid #e8e8ed"><img src="${SITE}/assets/img/logo-dark-email.png" alt="AquaZen" width="150" height="91" style="display:block;border:0"></td></tr>
<tr><td style="padding:32px;font-size:16px;line-height:1.55">${inner}</td></tr>
</table>
<p style="font-size:12px;color:#86868b;margin:20px 0 0">Aqua Zen Wellness Consulting, operating as AquaZen. 7049 Russell Ave, Burnaby, BC V5J 4R8.</p>
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

  // Also put them on the staff portal's Customers tab as an unassigned lead, so a sale can be written up from it.
  try {
    const stamp = new Date().toLocaleDateString("en-CA", { timeZone: "America/Vancouver", year: "numeric", month: "short", day: "numeric" });
    const notes = [`Find your Zen (${stamp}), from the website:`,
      ...Object.entries(readable).map(([q, a]) => `- ${q}: ${a}`),
      `- Best time to call: ${bestTime || "not given"}`,
      (answers as Record<string, unknown>).interested_in ? `- Looked at: ${clip((answers as Record<string, unknown>).interested_in, 80)}` : "",
      rec ? `- Suggested (Shaun only): ${rec}` : ""].filter(Boolean).join("\n");
    const { data: existing } = await db.from("customers").select("id, notes").ilike("email", email).limit(1).maybeSingle();
    if (existing) {
      await db.from("customers").update({ cell: phone, city_pc: city || undefined, notes: [notes, existing.notes].filter(Boolean).join("\n\n").slice(0, 8000) }).eq("id", existing.id);
    } else {
      await db.from("customers").insert({ name: [first, last].filter(Boolean).join(" "), email, cell: phone, city_pc: city || null, heard_about: "Website: Find your Zen", notes });
    }
  } catch (e) { console.error("customer from lead", e); }

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

  const pk = Array.isArray(b.picks) ? (b.picks as unknown[]).map((x) => String(x)).filter((x) => x in TUBS).slice(0, 2) : [];
  const picksHtml = pk.length === 2 ? `
<p style="margin:0 0 12px">From your answers, these are the two I'd love you to sit in:</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px"><tr>${pickCard(pk[0], "Your best fit")}${pickCard(pk[1], TUBS[pk[0]][1] === "series-three" ? "Also worth sitting in" : "One series up")}</tr></table>
<p style="margin:0 0 14px">Specs only go so far. How the massage feels is something you notice in the first minute, and at your visit I'll show you the one detail that decides how little time you'll spend on your water.</p>` : "";

  const customer = shell(`
<h1 style="font-size:24px;margin:0 0 16px">Thank you, ${esc(first)}.</h1>
<p style="margin:0 0 14px">I've got your answers, and I'll call you${bestTime && bestTime !== "Any time" ? ` in the ${esc(bestTime.toLowerCase())}` : ""} to book a quiet visit to the showroom.</p>
${picksHtml}
<p style="margin:0 0 14px">Here's why I start with questions instead of a sales pitch. The reason people want a hot tub is they actually want a place of peace: twenty minutes a night where the phones stay inside and you can actually breathe and talk to the people you love. The right tub is the one that fits how you'll use it, not the biggest one on the floor.</p>
<p style="margin:0 0 14px">So I read every answer myself. When we talk, I'll tell you honestly what I'd choose for your family, even if it's the smaller tub. I'd rather you love it for years than overspend.</p>
<p style="margin:0 0 24px">Can't wait for my call? Call or text me any time at <a href="tel:+12363044424" style="color:#347c6e">${PHONE}</a>, or just reply to this email.</p>
<p style="margin:0">Talk soon,<br><strong>Shaun McAvoy</strong><br>AquaZen, 7049 Russell Ave, Burnaby</p>`);

  await Promise.all([
    sendEmail(key, { from: FROM, to: [to], reply_to: email, subject: `New lead: ${name}${city ? `, ${city}` : ""}`, html: staff }),
    sendEmail(key, { from: FROM, to: [email], reply_to: REPLY_TO, subject: "Thanks for finding your Zen with AquaZen", html: customer }),
  ]);

  return json({ ok: true });
});
