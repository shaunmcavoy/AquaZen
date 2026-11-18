// One edge function for the customer and staff portals. Route = last path segment, e.g. /functions/v1/portal/signing
import { admin, button, FUNCTIONS_URL, payTerms, caller, cors, corsAuth, dataUrlToBytes, emailShell, ensureUser, escapeHtml, firstNameOf, FROM, json, jsonAuth, logEvent, loginLink, money, REPLY_TO, sendEmail, SITE_URL, productNoun, productMaker, productWhat, balanceHow, h, MUTED, windowLabel, windowChoices, validWindow, noonVancouver } from "../_shared/common.ts";
import { buildAgreementPdf, sha256Hex, toBase64 } from "../_shared/pdf.ts";
import { createDepositInvoice, createBalanceInvoice, ensureSaleItem, invoiceBalance, qbAuthUrl, qbConfigured, qbDisconnect, qbExchange, qbLists, qbStatus } from "../_shared/qb.ts";

// ---- login-link ----
// POST {email, next?}  Emails a one-tap sign-in link. Always answers "ok" so it never reveals who has an account.

async function route_login_link(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* ignore */ }
  const email = String(body.email ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return json(req, { error: "Please enter a valid email address." }, 400);
  const next = String(body.next ?? "").startsWith("/") ? String(body.next) : "";
  const db = admin();

  let { data: prof } = await db.from("profiles").select("id,full_name,role,active").eq("email", email).maybeSingle();
  if (!prof) {
    const { data: isAdmin } = await db.rpc("is_admin_email", { e: email });
    if (isAdmin) {
      await db.auth.admin.createUser({ email, email_confirm: true });
      ({ data: prof } = await db.from("profiles").select("id,full_name,role,active").eq("email", email).maybeSingle());
    }
  }
  if (!prof || !prof.active) return json(req, { ok: true });

  const link = await loginLink(email, next);
  const isStaff = prof.role !== "customer";
  const why = isStaff
    ? "This keeps every deal, agreement and delivery in one place, so nothing falls through the cracks and every customer gets the same great experience."
    : "Your portal keeps everything about your purchase in one place: your agreement, its details, delivery and, later, your warranty and care reminders. No digging through emails, and you can always reach me directly.";
  const setPw = next.startsWith("/login/?setpw=1");
  await sendEmail({
    from: FROM, to: email, reply_to: REPLY_TO,
    subject: setPw ? "Set your password for AquaZen" : "Your sign-in link for AquaZen",
    html: emailShell({
      preheader: setPw ? "Tap to choose your password. The link works once and expires in an hour." : "Tap to sign in. The link works once and expires in an hour.",
      body: `<p>Hi ${firstNameOf(prof.full_name)},</p><p>${setPw
        ? "Here's your link to choose a password. Once it's set, you can sign in any time with your email and password, with no waiting for an email. The link works once and expires in an hour."
        : "Here's your link to sign in. It works once and expires in an hour."}</p>
${button(link, setPw ? "Choose my password" : "Sign in")}<p style="color:${MUTED}">${why}</p>
<p style="color:${MUTED};font-size:14px">If you didn't ask for this, ignore this email. Nobody can sign in without this link.</p><p>Shaun</p>`,
    }),
    text: `Sign in to AquaZen: ${link}\n\nThe link works once and expires in an hour. If you didn't ask for this, ignore this email.`,
  });
  return json(req, { ok: true });
}

// ---- invite-staff ----
// POST {email, full_name, phone?}  Admins only. Creates a salesperson login and emails them a welcome with a sign-in link.

async function route_invite_staff(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsAuth(req) });
  const me = await caller(req);
  if (!me || me.profile.role !== "admin") return jsonAuth(req, { error: "Only Shaun or an admin can add team members." }, 403);
  const b = await req.json().catch(() => ({}));
  const email = String(b.email ?? "").trim().toLowerCase();
  const name = String(b.full_name ?? "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || !name) return jsonAuth(req, { error: "Enter a name and a valid email." }, 400);
  const role = b.role === "admin" ? "admin" : "staff";
  const id = await ensureUser(email, name, role);
  await admin().from("profiles").update({ role, full_name: name, phone: String(b.phone ?? "") || null, active: true }).eq("id", id);
  const link = await loginLink(email, "/staff/");
  await sendEmail({
    from: FROM, to: email, reply_to: REPLY_TO, subject: "Welcome to the AquaZen team",
    html: emailShell({
      preheader: "Your staff account is ready.",
      body: `<p>Hi ${firstNameOf(name)},</p><p>You've been added to the AquaZen team. Your staff portal is where you write up sales, get agreements signed and follow each tub through to delivery.</p>
${button(link, "Open the staff portal")}
<p style="color:${MUTED}">${role === "admin" ? "As an admin you'll see every customer and deal, so nothing slips through the cracks and every customer gets the same honest, simple experience." : "We run every sale through the portal so every customer gets the same honest, simple experience, and so you can always see where your deals and commission stand."}</p>
<p>Next time, go to aquazen.ca/login. You can set a password there, or just use an email link.</p><p>Shaun</p>`,
    }),
  });
  return jsonAuth(req, { ok: true, id });
}

// ---- send-for-signature ----
// POST {sale_id, rep_signature (PNG data URL), email_customer: boolean}
// The salesperson signs as company representative and locks the agreement. Returns a link for the customer to sign.

async function route_send_for_signature(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsAuth(req) });
  const me = await caller(req);
  if (!me || !["admin", "staff"].includes(me.profile.role)) return jsonAuth(req, { error: "Please sign in as staff." }, 401);
  const b = await req.json().catch(() => ({}));
  const db = admin();
  const { data: sale } = await db.from("sales").select("*, customers(*)").eq("id", String(b.sale_id ?? "")).maybeSingle();
  if (!sale) return jsonAuth(req, { error: "Sale not found." }, 404);
  if (me.profile.role !== "admin" && sale.salesperson_id !== me.user.id) return jsonAuth(req, { error: "This isn't your sale." }, 403);
  if (!["draft", "awaiting_customer"].includes(sale.status)) return jsonAuth(req, { error: "This agreement is already signed." }, 409);

  const c = sale.customers;
  const missing = [];
  if (!c?.name) missing.push("customer name");
  if (!c?.email) missing.push("customer email");
  if (!sale.tub_model && !sale.sauna_model) missing.push("a product model");
  if (Number(sale.total) <= 0) missing.push("pricing");
  if (Number(sale.deposit) > Number(sale.total)) missing.push("a deposit no bigger than the total");
  if (missing.length) return jsonAuth(req, { error: `Before sending, please add ${missing.join(", ")}.` }, 400);

  let patch: Record<string, unknown> = {};
  if (sale.status === "draft") {
    const sig = dataUrlToBytes(String(b.rep_signature ?? ""));
    if (!sig) return jsonAuth(req, { error: "Please sign in the box first." }, 400);
    const path = `${sale.id}/rep-signature.png`;
    const up = await db.storage.from("agreements").upload(path, sig, { contentType: "image/png", upsert: true });
    if (up.error) return jsonAuth(req, { error: "Couldn't save the signature. Try again." }, 500);
    const { data: tv } = await db.rpc("current_terms_version");
    patch = {
      status: "awaiting_customer", rep_signature_path: path, rep_signed_at: new Date().toISOString(),
      rep_name: me.profile.full_name || me.profile.email, terms_version: tv,
    };
  }
  const token = crypto.randomUUID();
  patch = { ...patch, sign_token: token, sign_token_expires: new Date(Date.now() + 14 * 86400_000).toISOString() };
  const { error } = await db.from("sales").update(patch).eq("id", sale.id);
  if (error) return jsonAuth(req, { error: "Couldn't update the sale." }, 500);
  await logEvent(sale.id, sale.status === "draft" ? "rep_signed" : "link_resent", me.user.id);

  const signUrl = `${SITE_URL}/sign/?t=${token}`;
  if (b.email_customer) {
    const what = productWhat(sale, true);
    await sendEmail({
      from: FROM, to: c.email, reply_to: REPLY_TO, subject: `Your AquaZen agreement is ready to sign`,
      html: emailShell({
        preheader: "Review your agreement and sign online in a couple of minutes.",
        body: `<p>Hi ${escapeHtml(firstNameOf(c.name))},</p>
<p>Thank you for choosing us for your ${escapeHtml(what.trim())}. Your sales agreement is ready. Please read it over and sign online. It takes a couple of minutes on your phone or computer.</p>
${button(signUrl, "Review and sign")}
${Number(sale.deposit) > 0 ? `<p>Once you've signed, you can pay your ${payTerms(sale).full ? `${money(sale.deposit)} in full` : `${money(sale.deposit)} deposit`} right there on the same page, ${payTerms(sale).how}, so your order goes in straight away.</p>` : ""}
<p style="color:${MUTED}">We do this online so you have a clear copy of everything we agreed, in writing, with nothing left to memory. When you sign, you'll also choose the two weeks you'd like your delivery, or as soon as possible. Then you'll get a copy by email with what to do to get your spot ready.</p>
<p>If anything doesn't look right, don't sign. Just reply or call me at 236-304-4424 and we'll fix it.</p><p>Shaun</p>`,
      }),
    });
    await logEvent(sale.id, "link_emailed", me.user.id, { to: c.email });
  }
  return jsonAuth(req, { ok: true, sign_url: signUrl });
}

// ---- signing ----
// GET ?t=token  -> agreement details for the customer to review.
// POST {t, signature, typed_name, agree:true} -> customer signs; PDF is created, account made, welcome email sent.

const PUBLIC_FIELDS = ["number","status","sale_date","product_type","tub_make","tub_model","shell_colour","siding","water_care","stereo","starter_kit","steps","lifter","spa_cover","other","est_delivery","hot_tub_value","sauna_make","sauna_model","sauna_electrical","sauna_total","notes","delivery_fee","tax_rate","tax","total","deposit","balance","payment_type","pay_methods","balance_method","rep_name","rep_signed_at","terms_version","delivery_window","msrp","extras","extras_total"];

async function load(token: string) {
  if (!/^[0-9a-f-]{36}$/i.test(token)) return null;
  const { data } = await admin().from("sales").select("*, customers(*)").eq("sign_token", token).maybeSingle();
  return data;
}

async function route_signing(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  const db = admin();

  if (req.method === "GET") {
    const sale = await load(new URL(req.url).searchParams.get("t") ?? "");
    if (!sale) return json(req, { error: "This signing link isn't valid. Call or text Shaun at 236-304-4424 for a new one." }, 404);
    if (sale.status !== "awaiting_customer") return json(req, { error: "This agreement has already been signed.", signed: true }, 409);
    if (new Date(sale.sign_token_expires) < new Date()) return json(req, { error: "This signing link has expired. Call or text Shaun at 236-304-4424 for a new one." }, 410);
    const { data: terms } = await db.from("agreement_terms").select("*").eq("version", sale.terms_version).single();
    const out: Record<string, unknown> = {};
    for (const k of PUBLIC_FIELDS) out[k] = sale[k];
    const c = sale.customers;
    out.customer = { name: c.name, address: c.address, city_pc: c.city_pc, cell: c.cell, email: c.email, heard_about: c.heard_about };
    out.terms = terms;
    // Delivery windows the customer can choose from: ASAP, then two-week windows.
    out.windows = windowChoices().map((v) => ({ value: v, label: windowLabel(v) }));
    return json(req, out);
  }

  const b = await req.json().catch(() => ({}));
  const sale = await load(String(b.t ?? ""));
  if (!sale || sale.status !== "awaiting_customer" || new Date(sale.sign_token_expires) < new Date())
    return json(req, { error: "This signing link isn't valid any more. Call or text Shaun at 236-304-4424 for a new one." }, 410);
  if (b.agree !== true) return json(req, { error: "Please tick the box to confirm you agree." }, 400);
  const typed = String(b.typed_name ?? "").trim().slice(0, 120);
  if (typed.length < 2) return json(req, { error: "Please type your full name." }, 400);
  const sig = dataUrlToBytes(String(b.signature ?? ""));
  if (!sig) return json(req, { error: "Please draw your signature in the box." }, 400);
  const win = String(b.delivery_window ?? "");
  if (!validWindow(win)) return json(req, { error: "Please choose when you'd like your delivery." }, 400);
  sale.delivery_window = win;

  const c = sale.customers;
  const now = new Date().toISOString();
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || null;
  const ua = (req.headers.get("user-agent") ?? "").slice(0, 300);
  const custPath = `${sale.id}/customer-signature.png`;
  await db.storage.from("agreements").upload(custPath, sig, { contentType: "image/png", upsert: true });
  const repSig = sale.rep_signature_path
    ? new Uint8Array(await (await db.storage.from("agreements").download(sale.rep_signature_path)).data!.arrayBuffer())
    : null;
  const { data: terms } = await db.from("agreement_terms").select("*").eq("version", sale.terms_version).single();
  const signed = { ...sale, customer_signed_at: now, customer_typed_name: typed, customer_sign_ip: ip, customer_sign_ua: ua };
  const pdfBytes = await buildAgreementPdf({ sale: signed, customer: c, terms, repSig, custSig: sig });
  const pdfPath = `${sale.id}/agreement-${sale.number}.pdf`;
  await db.storage.from("agreements").upload(pdfPath, pdfBytes, { contentType: "application/pdf", upsert: true });
  const hash = await sha256Hex(pdfBytes);

  // Customer account (so they can use the portal)
  const userId = await ensureUser(c.email, c.name, "customer");
  if (!c.user_id) await db.from("customers").update({ user_id: userId }).eq("id", c.id);

  await db.from("sales").update({
    status: "signed", customer_signed_at: now, customer_typed_name: typed, customer_sign_ip: ip, customer_sign_ua: ua,
    delivery_window: win, customer_signature_path: custPath, agreement_pdf_path: pdfPath, agreement_sha256: hash, sign_token: null,
  }).eq("id", sale.id);
  await logEvent(sale.id, "customer_signed", userId, { ip, sha256: hash, delivery_window: win });

  const after = await afterSigned(sale, c, pdfBytes, "online");
  const pt = payTerms(sale);
  // The signing page shows the pay button right away, so the customer can sign and pay in one go.
  return json(req, {
    ok: true, number: sale.number, pay_link: after.payLink, amount: Number(sale.deposit), balance: Number(sale.balance),
    full: pt.full, pay_label: pt.button, how: pt.how, window: windowLabel(win),
  });
}

// The payment paragraph used in customer emails: what they owe now, why it matters, and the pay button if there is one.
function payWhy(sale: any, link: string | null) {
  const p = payTerms(sale);
  const why = p.full
    ? `Your total is ${money(sale.deposit)}, paid in full as we agreed. Paying it confirms your order with ${escapeHtml(productMaker(sale))} so your ${productNoun(sale)} can be built and shipped to us, and there's nothing left to pay on delivery day.`
    : `Your deposit is ${money(sale.deposit)}, as we agreed. Paying it confirms your order with ${escapeHtml(productMaker(sale))} so your ${productNoun(sale)} can be built and shipped to us. ${sale.balance_method && sale.balance_method !== "before_delivery" ? `Your remaining balance of ${money(sale.balance)} will be paid ${balanceHow(sale)}, as we agreed.` : `Your remaining balance of ${money(sale.balance)} is due before delivery.`}`;
  return link
    ? `<p>${why} You can pay securely online ${p.how} through QuickBooks:</p>${button(link, p.button)}`
    : `<p>${why} I'll be in touch about payment.</p>`;
}

// Everything that happens once an agreement is signed, online or on paper:
// QuickBooks deposit invoice, welcome email with delivery prep and the portal, and a notice to the salesperson and admins.
async function afterSigned(sale: any, c: any, pdfBytes: Uint8Array, method: "online" | "paper") {
  const db = admin();
  // Deposit invoice in QuickBooks (if connected), so the welcome email can carry a Pay now button.
  let payLink: string | null = null, invoiceProblem = "";
  try {
    const st = await qbStatus();
    if (!st.connected) invoiceProblem = "QuickBooks isn't connected, so no invoice was created.";
    else {
      const r = await createDepositInvoice({ ...sale, status: "signed" }, c);
      payLink = r?.link ?? null;
      if (r) await logEvent(sale.id, "qb_invoice_created", null, { invoice: r.invoiceId });
      if (r && !payLink) invoiceProblem = "The invoice was created in QuickBooks, but QuickBooks didn't return a pay link. Check that online payments are turned on for the account.";
    }
  } catch (e) {
    console.error("qb invoice", e);
    invoiceProblem = String((e as Error).message ?? e);
    await logEvent(sale.id, "qb_invoice_failed", null, { error: String(e) });
  }

  // Welcome to the family
  const portal = await loginLink(c.email, "/portal/");
  const what = productWhat(sale);
  const pt = payTerms(sale);
  try {
    await sendEmail({
      from: FROM, to: c.email, reply_to: REPLY_TO, subject: "Welcome to AquaZen. Your Zen Time starts here.",
      html: emailShell({
        preheader: "Your signed agreement is attached, with what to do before delivery.",
        body: `<p>Hi ${escapeHtml(firstNameOf(c.name))},</p>
<p style="font-size:24px;font-weight:600;letter-spacing:-0.01em;margin:0 0 10px">Congratulations.</p>
<p>You've just made room in your life for a place of peace at home. A place to slow down, recover and reconnect with yourself and the people you love, every single day. I'm really glad I got to help you find it, and you picked a great ${productNoun(sale)}.</p>
<p>Thank you for trusting me with your ${escapeHtml(what)}. ${method === "paper" ? `You have your signed paper copy, and a digital copy of agreement #${sale.number} is attached so it's always easy to find.` : `Your signed agreement (#${sale.number}) is attached for your records.`}</p>
${sale.delivery_window ? `${h("Your delivery window")}<p><b>${escapeHtml(windowLabel(sale.delivery_window))}</b>. ${sale.delivery_window === "asap" ? "I'll get your order moving right away and call you to set the day." : "I'll call you as that window gets close to set the exact day."} Need to change it? Just call or text me.</p>` : ""}
${h("Getting your spot ready")}
<p>A smooth delivery day comes down to three things, and it's worth sorting them out now:</p>
<p><b>A solid, level base.</b> A concrete pad, pavers on compacted gravel or a deck built for the weight. Level matters: it protects the shell and frame for the life of the tub.<br>
<b>The right power.</b> A licensed electrician runs the dedicated circuit and disconnect your ${productNoun(sale)} needs. This keeps you safe and keeps your warranty intact.<br>
<b>A clear path.</b> Measure gates, corners and steps from the street to the spot, and let me know about anything tight. We'll plan around it.</p>
<p style="color:${MUTED}">Not sure about any of it? Send me a photo of the spot and I'll tell you what I see. That's what I'm here for.</p>
${h("Your customer portal")}
<p>Your own portal has your ${productNoun(sale)}'s details, your agreement and where things stand, from order to delivery day.</p>
${button(portal, "Open my portal")}
<p style="color:${MUTED};font-size:14px">That button signs you in once. Next time, go to aquazen.ca/login and enter this email.</p>
${h(pt.full ? "Your payment" : "Your deposit")}
${payWhy(sale, payLink)}
<p style="color:${MUTED}">I don't think of this as a one-time sale. I set you up with the right equipment from day one so your water stays clean and easy, and you spend your time enjoying it, not fixing it. Call or text me any time at 236-304-4424.</p>
<p>Shaun</p>`,
      }),
      attachments: [
        { filename: `AquaZen Sales Agreement #${sale.number}.pdf`, content: toBase64(pdfBytes) },
      ],
    });
    await logEvent(sale.id, "welcome_sent", null, { to: c.email });
  } catch (e) {
    console.error("welcome email failed", e);
    await logEvent(sale.id, "welcome_failed", null, { error: String(e) });
  }

  // Let the salesperson and admins know
  try {
    const { data: rep } = await db.from("profiles").select("email").eq("id", sale.salesperson_id).single();
    const { data: admins } = await db.from("profiles").select("email").eq("role", "admin").eq("active", true);
    const to = [...new Set([rep?.email, ...(admins ?? []).map((a) => a.email)].filter(Boolean))] as string[];
    if (to.length) await sendEmail({
      from: FROM, to, subject: `Signed: agreement #${sale.number}, ${c.name}`,
      html: emailShell({ preheader: `${c.name} signed agreement #${sale.number}.`, body:
        `<p>${escapeHtml(c.name)} ${method === "paper" ? "signed on paper:" : "just signed"} agreement #${sale.number} for the ${escapeHtml(what)}. Total ${money(sale.total)}, ${pt.full ? "paid in full" : `deposit ${money(sale.deposit)}`}, ${pt.how}.</p>
<p>Delivery window: <b>${escapeHtml(windowLabel(sale.delivery_window) || "not chosen")}</b>.</p><p>They've been sent their signed copy, how to get their spot ready and a link to their portal.</p>
${Number(sale.deposit) > 0 && !payLink ? `<p style="background:#fff4e5;border-radius:10px;padding:12px 14px"><b>No pay link went to the customer.</b> ${escapeHtml(invoiceProblem || "The invoice couldn't be created.")} Once that's sorted, open the sale and tap "Create invoice and email pay link".</p>` : ""}${button(`${SITE_URL}/staff/#sale-${sale.id}`, "Open in staff portal")}` }),
      attachments: [{ filename: `Agreement #${sale.number}.pdf`, content: toBase64(pdfBytes) }],
    });
  } catch (e) { console.error("staff notice failed", e); }
  return { payLink };
}

// What a sale still needs before it can be signed (online or on paper).
function missingForSigning(sale: any) {
  const c = sale.customers, missing: string[] = [];
  if (!c?.name) missing.push("customer name");
  if (!c?.email) missing.push("customer email");
  if (!sale.tub_model && !sale.sauna_model) missing.push("a product model");
  if (Number(sale.total) <= 0) missing.push("pricing");
  if (Number(sale.deposit) > Number(sale.total)) missing.push("a deposit no bigger than the total");
  return missing;
}

async function staffSale(req: Request, saleId: string) {
  const me = await caller(req);
  if (!me || !["admin", "staff"].includes(me.profile.role)) return { err: jsonAuth(req, { error: "Please sign in as staff." }, 401) };
  const { data: sale } = await admin().from("sales").select("*, customers(*)").eq("id", saleId).maybeSingle();
  if (!sale) return { err: jsonAuth(req, { error: "Sale not found." }, 404) };
  if (me.profile.role !== "admin" && sale.salesperson_id !== me.user.id) return { err: jsonAuth(req, { error: "This isn't your sale." }, 403) };
  return { me, sale };
}

// ---- agreement-print ----
// POST {sale_id}  Staff. Signed sale: returns the signed copy. Unsigned sale: returns a printable copy with blank
// signature and date lines, for signing in person on paper. Response: {pdf: base64}.
async function route_agreement_print(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsAuth(req) });
  const b = await req.json().catch(() => ({}));
  const r = await staffSale(req, String(b.sale_id ?? ""));
  if (r.err) return r.err;
  const { me, sale } = r;
  const db = admin();
  if (sale.agreement_pdf_path) {
    const f = await db.storage.from("agreements").download(sale.agreement_pdf_path);
    if (f.error || !f.data) return jsonAuth(req, { error: "Couldn't load the signed agreement." }, 500);
    return jsonAuth(req, { pdf: toBase64(new Uint8Array(await f.data.arrayBuffer())), signed: true });
  }
  const missing = missingForSigning(sale);
  if (missing.length) return jsonAuth(req, { error: `Before printing, please add ${missing.join(", ")}.` }, 400);
  const { data: tv } = await db.rpc("current_terms_version");
  const version = sale.terms_version ?? tv;
  const { data: terms } = await db.from("agreement_terms").select("*").eq("version", version).single();
  const repName = sale.rep_name ?? (me!.profile.full_name || me!.profile.email);
  const pdfBytes = await buildAgreementPdf({ sale: { ...sale, rep_name: repName, terms_version: version }, customer: sale.customers, terms, mode: "paper-blank" });
  await logEvent(sale.id, "printed_for_paper", me!.user.id);
  return jsonAuth(req, { pdf: toBase64(pdfBytes), signed: false });
}

// ---- paper-signed ----
// POST {sale_id, photos?: [dataUrl jpeg/png]}  Staff. Records that the agreement was signed in person on paper,
// stores a record PDF (with photos of the signed pages), then runs the same welcome steps as an online signing.
async function route_paper_signed(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsAuth(req) });
  const b = await req.json().catch(() => ({}));
  const r = await staffSale(req, String(b.sale_id ?? ""));
  if (r.err) return r.err;
  const { me, sale } = r;
  if (!["draft", "awaiting_customer"].includes(sale.status)) return jsonAuth(req, { error: "This agreement is already signed." }, 409);
  const missing = missingForSigning(sale);
  if (missing.length) return jsonAuth(req, { error: `Before marking it signed, please add ${missing.join(", ")}.` }, 400);
  if (b.confirm !== true) return jsonAuth(req, { error: "Please confirm both of you signed the paper copies." }, 400);

  const db = admin();
  const photos: { bytes: Uint8Array; type: string }[] = [];
  const rawPhotos = Array.isArray(b.photos) ? b.photos.slice(0, 6) : [];
  for (const d of rawPhotos) {
    const m = /^data:(image\/(?:jpeg|png));base64,([A-Za-z0-9+/=]+)$/.exec(String(d));
    if (!m) return jsonAuth(req, { error: "Photos must be JPG or PNG images." }, 400);
    const bin = atob(m[2]);
    if (bin.length > 4_000_000) return jsonAuth(req, { error: "One of the photos is too large. Try again." }, 400);
    photos.push({ bytes: Uint8Array.from(bin, (ch) => ch.charCodeAt(0)), type: m[1] });
  }
  const photoPaths: string[] = [];
  for (let i = 0; i < photos.length; i++) {
    const path = `${sale.id}/paper-page-${i + 1}.${photos[i].type === "image/png" ? "png" : "jpg"}`;
    await db.storage.from("agreements").upload(path, photos[i].bytes, { contentType: photos[i].type, upsert: true });
    photoPaths.push(path);
  }

  const now = new Date().toISOString();
  const c = sale.customers;
  const { data: tv } = await db.rpc("current_terms_version");
  const version = sale.terms_version ?? tv;
  const { data: terms } = await db.from("agreement_terms").select("*").eq("version", version).single();
  const repName = sale.rep_name ?? (me!.profile.full_name || me!.profile.email);
  const signed = { ...sale, rep_name: repName, rep_signed_at: sale.rep_signed_at ?? now, customer_signed_at: now, customer_typed_name: c.name, terms_version: version };
  const pdfBytes = await buildAgreementPdf({ sale: signed, customer: c, terms, mode: "paper-signed", photos });
  const pdfPath = `${sale.id}/agreement-${sale.number}.pdf`;
  await db.storage.from("agreements").upload(pdfPath, pdfBytes, { contentType: "application/pdf", upsert: true });
  const hash = await sha256Hex(pdfBytes);

  const userId = await ensureUser(c.email, c.name, "customer");
  if (!c.user_id) await db.from("customers").update({ user_id: userId }).eq("id", c.id);

  const { error } = await db.from("sales").update({
    status: "signed", signing_method: "paper", rep_name: repName, rep_signed_at: signed.rep_signed_at, terms_version: version,
    customer_signed_at: now, customer_typed_name: c.name, agreement_pdf_path: pdfPath, agreement_sha256: hash,
    paper_photo_paths: photoPaths, sign_token: null,
  }).eq("id", sale.id);
  if (error) return jsonAuth(req, { error: "Couldn't update the sale." }, 500);
  await logEvent(sale.id, "paper_signed", me!.user.id, { photos: photoPaths.length, sha256: hash });

  await afterSigned({ ...signed, status: "signed" }, c, pdfBytes, "paper");
  return jsonAuth(req, { ok: true, number: sale.number });
}

// ---- sale-progress ----
// POST {sale_id, action: "balance_paid" | "scheduled" | "delivered" | "undo_balance" | "undo_scheduled" | "undo_delivered", date?, serial_number?, notes?, email_customer?}
// Staff record what happens after the deposit, so each customer sits in the right group.
async function route_sale_progress(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsAuth(req) });
  const b = await req.json().catch(() => ({}));
  const r = await staffSale(req, String(b.sale_id ?? ""));
  if (r.err) return r.err;
  const { me, sale } = r;
  if (["draft", "awaiting_customer", "cancelled"].includes(sale.status)) return jsonAuth(req, { error: "This sale hasn't been signed yet." }, 409);
  const when = b.date && /^\d{4}-\d{2}-\d{2}/.test(String(b.date)) ? noonVancouver(String(b.date).slice(0, 10)) : new Date().toISOString();
  const db = admin();
  let patch: Record<string, unknown> = {};
  switch (b.action) {
    case "balance_paid": patch = { balance_paid_at: when }; break;
    case "undo_balance": patch = { balance_paid_at: null }; break;
    case "delivered": {
      patch = { status: "delivered", delivered_at: when };
      const serial = String(b.serial_number ?? "").trim().slice(0, 80);
      if (serial) patch.serial_number = serial;
      if (b.notes) patch.delivery_notes = String(b.notes).slice(0, 2000);
      break;
    }
    case "undo_delivered": patch = { status: sale.deposit_paid_at ? "deposit_paid" : "signed", delivered_at: null }; break;
    case "scheduled": {
      const day = String(b.date ?? "").slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return jsonAuth(req, { error: "Choose the delivery day." }, 400);
      patch = { status: sale.status === "delivered" ? "delivered" : "delivery_scheduled", delivery_date: day };
      break;
    }
    case "undo_scheduled": patch = { status: sale.deposit_paid_at ? "deposit_paid" : "signed", delivery_date: null }; break;
    default: return jsonAuth(req, { error: "Unknown action." }, 400);
  }
  const { error } = await db.from("sales").update(patch).eq("id", sale.id);
  if (error) return jsonAuth(req, { error: "Couldn't update the sale." }, 500);
  await logEvent(sale.id, String(b.action), me!.user.id, b.serial_number ? { serial: String(b.serial_number) } : null);
  // Let the customer know their delivery day, and why getting ready matters.
  if (b.action === "scheduled" && b.email_customer && sale.customers?.email) {
    const c = sale.customers, day = new Date(`${patch.delivery_date}T12:00:00Z`).toLocaleDateString("en-CA", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric" });
    try {
      await sendEmail({
        from: FROM, to: c.email, reply_to: REPLY_TO, subject: `Your delivery day: ${day}`,
        html: emailShell({ preheader: "Your delivery day is booked. Here's how to get ready.", body:
          `<p>Hi ${escapeHtml(firstNameOf(c.name))},</p><p>Your ${escapeHtml(productWhat(sale))} is booked for delivery on <b>${escapeHtml(day)}</b>. I'll confirm the time with you the day before.</p>
${h("Before we arrive")}
<p>Please make sure the base is finished and level, the electrician has run the power and disconnect, and the path from the street is clear. That's what lets us set your ${productNoun(sale)} in place, fill it and get it heating the same day.</p>
${Number(sale.balance) > 0 && !sale.balance_paid_at ? `<p>Your balance of ${money(sale.balance)} is due before delivery, so delivery day is only about getting you soaking.</p>` : ""}
<p style="color:${MUTED}">Need to change the day? Call or text me at 236-304-4424.</p><p>Shaun</p>` }),
      });
      await logEvent(sale.id, "delivery_emailed", me!.user.id, { to: c.email });
    } catch (e) { console.error("delivery email", e); }
  }
  return jsonAuth(req, { ok: true });
}

// ---- customer-delete ----
// POST {customer_id}  Admins. Removes a customer, all their deals, signed files and photos, and their portal login.
// QuickBooks is left alone: invoices and payments stay in the books.
async function route_customer_delete(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsAuth(req) });
  const me = await caller(req);
  if (!me || me.profile.role !== "admin") return jsonAuth(req, { error: "Only an admin can delete a customer." }, 403);
  const b = await req.json().catch(() => ({}));
  const db = admin();
  const { data: c } = await db.from("customers").select("id, user_id, email, name").eq("id", String(b.customer_id ?? "")).maybeSingle();
  if (!c) return jsonAuth(req, { error: "Customer not found." }, 404);
  const { data: sales } = await db.from("sales").select("id").eq("customer_id", c.id);
  // Signed agreements, signatures and photos live in folders named after each sale.
  for (const s of sales ?? []) {
    const { data: files } = await db.storage.from("agreements").list(s.id, { limit: 100 });
    if (files?.length) await db.storage.from("agreements").remove(files.map((f) => `${s.id}/${f.name}`));
  }
  if (sales?.length) {
    // Signed sales are locked against edits, so this runs with the server's own key.
    const del = await db.from("sales").delete().in("id", sales.map((s) => s.id));
    if (del.error) return jsonAuth(req, { error: "Couldn't delete this customer's deals." }, 500);
  }
  const dc = await db.from("customers").delete().eq("id", c.id);
  if (dc.error) return jsonAuth(req, { error: "Couldn't delete the customer." }, 500);
  // Remove their portal login if it was only ever a customer login and no other customer record uses it.
  if (c.user_id) {
    const { data: prof } = await db.from("profiles").select("role").eq("id", c.user_id).maybeSingle();
    const { count } = await db.from("customers").select("id", { count: "exact", head: true }).eq("user_id", c.user_id);
    if (prof?.role === "customer" && !count) await db.auth.admin.deleteUser(c.user_id);
  }
  console.log("customer deleted", c.id, "by", me.user.id, "sales", (sales ?? []).length);
  return jsonAuth(req, { ok: true, deleted_sales: (sales ?? []).length });
}

// ---- sale-reopen ----
// POST {sale_id}  Takes an agreement that was sent but not yet signed back to a draft so it can be changed.
// The old signing link stops working, and the salesperson signs and sends it again after editing.
async function route_sale_reopen(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsAuth(req) });
  const me = await caller(req);
  if (!me || !["admin", "staff"].includes(me.profile.role)) return jsonAuth(req, { error: "Please sign in as staff." }, 401);
  const b = await req.json().catch(() => ({}));
  const db = admin();
  const { data: sale } = await db.from("sales").select("id, number, status, salesperson_id, customer_signed_at, rep_signature_path").eq("id", String(b.sale_id ?? "")).maybeSingle();
  if (!sale) return jsonAuth(req, { error: "Sale not found." }, 404);
  if (me.profile.role !== "admin" && sale.salesperson_id !== me.user.id) return jsonAuth(req, { error: "This isn't your sale." }, 403);
  if (sale.status !== "awaiting_customer" || sale.customer_signed_at) {
    return jsonAuth(req, { error: "Only agreements that haven't been signed yet can be edited. A signed agreement needs a new one written up." }, 409);
  }
  const { error } = await db.from("sales").update({
    status: "draft", sign_token: null, sign_token_expires: null, rep_signed_at: null, rep_signature_path: null,
  }).eq("id", sale.id).eq("status", "awaiting_customer");
  if (error) return jsonAuth(req, { error: "Couldn't reopen this agreement." }, 500);
  if (sale.rep_signature_path) await db.storage.from("agreements").remove([sale.rep_signature_path]);
  await logEvent(sale.id, "reopened", me.user.id);
  return jsonAuth(req, { ok: true });
}

// ---- past-sale ----
// POST  Admins. Records a sale made before the website (or outside it) so it counts in Financials.
// Creates the customer and a sold sale with its costs. No agreement, emails or QuickBooks invoice.
async function route_past_sale(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsAuth(req) });
  const me = await caller(req);
  if (!me || me.profile.role !== "admin") return jsonAuth(req, { error: "Only an admin can record a past sale." }, 403);
  const b = await req.json().catch(() => ({}));
  const str = (v: unknown) => { const t = String(v ?? "").trim(); return t ? t.slice(0, 300) : null; };
  const n = (v: unknown) => { const x = Number(v); return isFinite(x) && x >= 0 ? Math.round(x * 100) / 100 : 0; };
  const type = ["hot_tub", "swim_spa", "mini_pool"].includes(b.product_type) ? b.product_type : "hot_tub";
  const name = str(b.name), model = str(b.model), date = /^\d{4}-\d{2}-\d{2}$/.test(String(b.sale_date)) ? String(b.sale_date) : null;
  if (!name) return jsonAuth(req, { error: "Add the customer's name." }, 400);
  if (!model) return jsonAuth(req, { error: "Choose the model that was sold." }, 400);
  if (!date) return jsonAuth(req, { error: "Add the date it was sold." }, 400);
  if (!n(b.price)) return jsonAuth(req, { error: "Add the sale price before GST and PST." }, 400);
  const email = str(b.email);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return jsonAuth(req, { error: "That email doesn't look right." }, 400);
  const db = admin();
  const { data: cust, error: ce } = await db.from("customers").insert({
    name, email: email ? email.toLowerCase() : null, cell: str(b.cell), city_pc: str(b.city_pc), created_by: me.user.id,
  }).select("id").single();
  if (ce || !cust) return jsonAuth(req, { error: "Couldn't save the customer." }, 500);
  const sauna = false, addon = null;
  const sale: Record<string, unknown> = {
    customer_id: cust.id, salesperson_id: me.user.id, rep_name: me.profile.full_name || me.profile.email,
    product_type: type, sale_date: date, customer_signed_at: noonVancouver(date),
    status: b.status === "sold" ? "deposit_paid" : "delivered", signing_method: "paper", recorded_past: true,
    payment_type: "full", pay_methods: "both", delivery_fee: n(b.delivery_fee), notes: str(b.notes),
    tub_make: str(b.make) || "AquaSolus", tub_model: sauna ? null : model,
    hot_tub_value: sauna ? 0 : n(b.price),
    sauna_make: null, sauna_model: addon, sauna_total: 0,
    tax_rate: b.tax_rate === 0 || b.tax_rate === "0" ? 0 : 0.12,
  };
  if (sale.status === "delivered") sale.delivered_at = noonVancouver(date);
  const { data: row, error: se } = await db.from("sales").insert(sale).select("id, number").single();
  if (se || !row) {
    await db.from("customers").delete().eq("id", cust.id);
    console.error("past-sale", se);
    return jsonAuth(req, { error: "Couldn't save the sale." }, 500);
  }
  const c = b.costs ?? {};
  await db.from("sale_costs").insert({
    sale_id: row.id, product_cost: n(c.product_cost), sauna_cost: n(c.sauna_cost), warehouse_shipping: n(c.warehouse_shipping),
    delivery_cost: n(c.delivery_cost), other_costs: n(c.other_costs), notes: str(c.notes), updated_by: me.user.id,
  });
  await logEvent(row.id, "recorded_past", me.user.id);
  return jsonAuth(req, { ok: true, id: row.id, number: row.number });
}

// ---- lead-assign ----
// POST {customer_id, user_id|null}  Admins. Hands a customer or lead to a salesperson (or back to "unassigned").
// Salespeople only ever see customers assigned to them, so this is what gives them access. Emails the new owner.
async function route_lead_assign(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsAuth(req) });
  const me = await caller(req);
  if (!me || me.profile.role !== "admin") return jsonAuth(req, { error: "Only an admin can assign leads." }, 403);
  const b = await req.json().catch(() => ({}));
  const db = admin();
  const { data: c } = await db.from("customers").select("id, name, email, cell, city_pc, notes, created_by").eq("id", String(b.customer_id ?? "")).maybeSingle();
  if (!c) return jsonAuth(req, { error: "Customer not found." }, 404);
  let owner: { id: string; email: string; full_name: string | null; role: string } | null = null;
  if (b.user_id) {
    const { data: p } = await db.from("profiles").select("id, email, full_name, role, active").eq("id", String(b.user_id)).maybeSingle();
    if (!p || !p.active || !["admin", "staff"].includes(p.role)) return jsonAuth(req, { error: "Choose an active team member." }, 400);
    owner = p;
  }
  const { error } = await db.from("customers").update({ created_by: owner ? owner.id : null, updated_at: new Date().toISOString() }).eq("id", c.id);
  if (error) return jsonAuth(req, { error: "Couldn't assign this lead." }, 500);
  if (owner && owner.id !== me.user.id && owner.email) {
    const who = me.profile.full_name || me.profile.email;
    try {
      await sendEmail({
        from: FROM, to: owner.email, reply_to: REPLY_TO, subject: `New lead for you: ${c.name}`,
        html: emailShell({ preheader: `${who} assigned ${c.name} to you.`, body:
          `<p>Hi ${escapeHtml(firstNameOf(owner.full_name || owner.email))},</p>
<p>${escapeHtml(who)} has assigned <b>${escapeHtml(c.name)}</b> to you. They're now on your Customers tab in the staff portal.</p>
<table style="font-size:15px;border-collapse:collapse;margin:8px 0 16px">
<tr><td style="padding:4px 12px 4px 0;color:${MUTED}">Cell</td><td>${escapeHtml(c.cell ?? "not given")}</td></tr>
<tr><td style="padding:4px 12px 4px 0;color:${MUTED}">Email</td><td>${escapeHtml(c.email ?? "not given")}</td></tr>
<tr><td style="padding:4px 12px 4px 0;color:${MUTED}">Area</td><td>${escapeHtml(c.city_pc ?? "not given")}</td></tr>
</table>
${c.notes ? `<p style="white-space:pre-line;background:#f5f5f7;border-radius:12px;padding:14px 16px;font-size:14px">${escapeHtml(String(c.notes).slice(0, 3000))}</p>` : ""}
${button(`${SITE_URL}/staff/#cust-${c.id}`, "Open them in the staff portal")}
<p style="color:${MUTED};font-size:14px">Call them at the time they asked for, listen first, and help them find the tub that fits how they'll use it. That's how we earn customers for life.</p>` }),
      });
    } catch (e) { console.error("assign email", e); }
  }
  return jsonAuth(req, { ok: true });
}

// ---- sale-delete ----
// POST {sale_ids: string[]}  Admins only. Removes the sales, their history, signed agreements and photos.
// The customer stays (as a lead) and QuickBooks is left alone: invoices and payments stay in the books.
async function route_sale_delete(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsAuth(req) });
  const me = await caller(req);
  if (!me || me.profile.role !== "admin") return jsonAuth(req, { error: "Only an admin can delete a sale." }, 403);
  const b = await req.json().catch(() => ({}));
  const ids = (Array.isArray(b.sale_ids) ? b.sale_ids : [b.sale_id]).map((x: unknown) => String(x ?? "")).filter(Boolean).slice(0, 200);
  if (!ids.length) return jsonAuth(req, { error: "Choose at least one sale." }, 400);
  const db = admin();
  const { data: sales } = await db.from("sales").select("id, number").in("id", ids);
  if (!sales?.length) return jsonAuth(req, { error: "Those sales weren't found." }, 404);
  for (const s of sales) {
    const { data: files } = await db.storage.from("agreements").list(s.id, { limit: 100 });
    if (files?.length) await db.storage.from("agreements").remove(files.map((f) => `${s.id}/${f.name}`));
  }
  // Signed sales are locked against edits, so this runs with the server's own key. History rows go with them.
  const del = await db.from("sales").delete().in("id", sales.map((s) => s.id));
  if (del.error) return jsonAuth(req, { error: "Couldn't delete those sales." }, 500);
  console.log("sales deleted", sales.map((s) => s.number).join(","), "by", me.user.id);
  return jsonAuth(req, { ok: true, deleted: sales.length });
}

// ---- agreement-pdf ----
// POST {sale_id}  Returns a short-lived download link for the signed agreement, if the caller is allowed to see that sale.

async function route_agreement_pdf(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsAuth(req) });
  const me = await caller(req);
  if (!me) return jsonAuth(req, { error: "Please sign in." }, 401);
  const b = await req.json().catch(() => ({}));
  // Uses the caller's own permissions: if they can't see the sale, this returns nothing.
  const { data: sale } = await me.userDb.from("sales").select("id, agreement_pdf_path").eq("id", String(b.sale_id ?? "")).maybeSingle();
  if (!sale?.agreement_pdf_path) return jsonAuth(req, { error: "No signed agreement yet." }, 404);
  const { data } = await admin().storage.from("agreements").createSignedUrl(sale.agreement_pdf_path, 300, { download: true });
  return jsonAuth(req, { url: data?.signedUrl });
}


// ---- QuickBooks (admins) ----
async function adminOnly(req: Request) {
  const me = await caller(req);
  return me && me.profile.role === "admin" ? me : null;
}

async function route_qb_status(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsAuth(req) });
  const me = await adminOnly(req);
  if (!me) return jsonAuth(req, { error: "Admins only." }, 403);
  if (!qbConfigured()) return jsonAuth(req, { configured: false, connected: false });
  const st = await qbStatus();
  const db = admin();
  const item = (await db.rpc("setting_get", { k: "qb_deposit_item_id" })).data;
  const tax = (await db.rpc("setting_get", { k: "qb_deposit_tax_code_id" })).data;
  let lists = null, listError = null;
  if (st.connected) { try { lists = await qbLists(); } catch (e) { listError = String((e as Error).message); } }
  return jsonAuth(req, { configured: true, ...st, item_id: item, tax_code_id: tax, lists, list_error: listError });
}

async function route_qb_connect(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsAuth(req) });
  const me = await adminOnly(req);
  if (!me) return jsonAuth(req, { error: "Admins only." }, 403);
  if (!qbConfigured()) return jsonAuth(req, { error: "Add QB_CLIENT_ID and QB_CLIENT_SECRET in Supabase first." }, 400);
  const { data: state } = await admin().rpc("qb_state_new", { uid: me.user.id });
  return jsonAuth(req, { url: qbAuthUrl(state) });
}

async function route_qb_callback(req: Request): Promise<Response> {
  const q = new URL(req.url).searchParams;
  const back = (s: string) => new Response(null, { status: 302, headers: { Location: `${SITE_URL}/staff/?qb=${s}#team` } });
  if (q.get("error")) return back("cancelled");
  const { data: uid } = await admin().rpc("qb_state_take", { s: q.get("state") ?? "" });
  if (!uid || !q.get("code") || !q.get("realmId")) return back("failed");
  try { await qbExchange(q.get("code")!, q.get("realmId")!, uid); return back("connected"); }
  catch (e) { console.error(e); return back("failed"); }
}

async function route_qb_settings(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsAuth(req) });
  const me = await adminOnly(req);
  if (!me) return jsonAuth(req, { error: "Admins only." }, 403);
  const b = await req.json().catch(() => ({}));
  const db = admin();
  if (b.disconnect) { await qbDisconnect(); return jsonAuth(req, { ok: true }); }
  if (b.create_item) {
    const r = await ensureSaleItem();
    await db.rpc("setting_put", { k: "qb_deposit_item_id", v: r.id });
    return jsonAuth(req, { ok: true, item_id: r.id, account: r.account });
  }
  if (b.item_id !== undefined) await db.rpc("setting_put", { k: "qb_deposit_item_id", v: String(b.item_id ?? "") });
  if (b.tax_code_id !== undefined) await db.rpc("setting_put", { k: "qb_deposit_tax_code_id", v: String(b.tax_code_id ?? "") });
  return jsonAuth(req, { ok: true });
}

// Staff: create (or re-create) the deposit invoice for a signed sale and email the pay link.
async function route_qb_invoice(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsAuth(req) });
  const me = await caller(req);
  if (!me || !["admin", "staff"].includes(me.profile.role)) return jsonAuth(req, { error: "Please sign in as staff." }, 401);
  const b = await req.json().catch(() => ({}));
  const { data: visible } = await me.userDb.from("sales").select("id").eq("id", String(b.sale_id ?? "")).maybeSingle();
  if (!visible) return jsonAuth(req, { error: "Sale not found." }, 404);
  const db = admin();
  const { data: sale } = await db.from("sales").select("*, customers(*)").eq("id", visible.id).single();
  if (sale.status !== "signed") return jsonAuth(req, { error: "The invoice is only created after the customer signs." }, 409);
  let r = sale.qb_deposit_invoice_id ? { invoiceId: sale.qb_deposit_invoice_id, link: sale.qb_invoice_link } : null;
  if (!r) r = await createDepositInvoice(sale, sale.customers);
  if (!r) return jsonAuth(req, { error: "This sale has no deposit." }, 400);
  await logEvent(sale.id, "qb_invoice_created", me.user.id, { invoice: r.invoiceId });
  if (b.email_customer && r.link) {
    const c = sale.customers;
    await sendEmail({
      from: FROM, to: c.email, reply_to: REPLY_TO, subject: `Your ${payTerms(sale).noun} for agreement #${sale.number}`,
      html: emailShell({ preheader: `Pay your ${payTerms(sale).noun} securely online.`, body:
        `<p>Hi ${escapeHtml(firstNameOf(c.name))},</p>${payWhy(sale, r.link)}<p style="color:${MUTED}">Questions? Call or text me at 236-304-4424.</p><p>Shaun</p>` }),
    });
    await logEvent(sale.id, "pay_link_emailed", me.user.id, { to: c.email });
  }
  return jsonAuth(req, { ok: true, link: r.link });
}

// ---- qb-balance-invoice ----
// POST {sale_id, email_customer}  Staff. Creates the balance invoice once the deposit is in, and emails the pay link.
async function route_qb_balance_invoice(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsAuth(req) });
  const b = await req.json().catch(() => ({}));
  const r0 = await staffSale(req, String(b.sale_id ?? ""));
  if (r0.err) return r0.err;
  const { me, sale } = r0;
  if (!["deposit_paid", "delivery_scheduled", "delivered"].includes(sale.status)) return jsonAuth(req, { error: "The balance invoice comes after the deposit is paid." }, 409);
  if (sale.balance_paid_at) return jsonAuth(req, { error: "The balance is already marked paid." }, 409);
  let r = sale.qb_balance_invoice_id ? { invoiceId: sale.qb_balance_invoice_id, link: sale.qb_balance_link } : null;
  if (!r) r = await createBalanceInvoice(sale, sale.customers);
  if (!r) return jsonAuth(req, { error: "This sale has no balance left to pay." }, 400);
  await logEvent(sale.id, "qb_balance_invoice_created", me!.user.id, { invoice: r.invoiceId });
  if (b.email_customer && r.link) {
    const c = sale.customers;
    const p = payTerms(sale);
    await sendEmail({
      from: FROM, to: c.email, reply_to: REPLY_TO, subject: `Your balance for agreement #${sale.number}`,
      html: emailShell({ preheader: "Pay your balance securely online before delivery.", body:
        `<p>Hi ${escapeHtml(firstNameOf(c.name))},</p>
<p>Your ${escapeHtml(productWhat(sale))} is getting close. Your remaining balance is <b>${money(sale.balance)}</b>. Paying it before delivery means delivery day is only about getting you soaking, with nothing to sort out at the door.</p>
${sale.delivery_window ? `<p>Your delivery window: <b>${escapeHtml(windowLabel(sale.delivery_window))}</b>.</p>` : ""}
<p>You can pay securely online ${p.how} through QuickBooks:</p>${button(r.link, "Pay my balance")}
<p style="color:${MUTED}">Questions? Call or text me at 236-304-4424.</p><p>Shaun</p>` }),
    });
    await logEvent(sale.id, "balance_link_emailed", me!.user.id, { to: c.email });
  }
  return jsonAuth(req, { ok: true, link: r.link });
}

// Scheduled: checks open deposit invoices and marks paid ones.
async function route_qb_sync(req: Request): Promise<Response> {
  const db = admin();
  const { data: ok } = await db.rpc("check_cron_secret", { s: req.headers.get("x-cron-secret") ?? "" });
  if (ok !== true) return new Response("Forbidden", { status: 403 });
  const st = await qbStatus();
  if (!st.connected) return new Response(JSON.stringify({ skipped: "not connected" }));
  const { data: open } = await db.from("sales").select("*, customers(*)").eq("status", "signed").not("qb_deposit_invoice_id", "is", null).limit(100);
  const paid = [];
  for (const sale of open ?? []) {
    try {
      const { balance } = await invoiceBalance(sale.qb_deposit_invoice_id);
      if (balance > 0) continue;
      const now = new Date().toISOString();
      await db.from("sales").update({ status: "deposit_paid", deposit_paid_at: now }).eq("id", sale.id).eq("status", "signed");
      await logEvent(sale.id, "deposit_paid", null, { invoice: sale.qb_deposit_invoice_id });
      paid.push(sale.number);
      const c = sale.customers;
      const what = productWhat(sale);
      const portal = await loginLink(c.email, "/portal/");
      const pt = payTerms(sale);
      await sendEmail({
        from: FROM, to: c.email, reply_to: REPLY_TO, subject: `${pt.received}. Your ${productNoun(sale)} is on order.`,
        html: emailShell({ preheader: "Thank you. Here's what happens next.", body:
          `<p>Hi ${escapeHtml(firstNameOf(c.name))},</p><p>Thank you, we've received your ${money(sale.deposit)} ${pt.full ? "payment. You're paid in full, and your" : "deposit. Your"} ${escapeHtml(what)} is now on order with ${escapeHtml(productMaker(sale))}.</p>
${h("What to do while you wait")}
<p>This is the perfect time to get your spot ready: a solid, level base, power run by a licensed electrician, and a clear path to the backyard. Having these done before your ${productNoun(sale)} arrives is what makes delivery day quick and easy, and it protects your warranty.</p>
${sale.delivery_window ? `<p>Your delivery window: <b>${escapeHtml(windowLabel(sale.delivery_window))}</b>.</p>` : ""}
${button(portal, "Open my portal")}
<p style="color:${MUTED}">I'll be in touch to set the exact delivery day.${pt.full ? "" : ` Your remaining balance of ${money(sale.balance)} is due before delivery.`} Questions any time? Call or text me at 236-304-4424.</p><p>Shaun</p>` }),
      });
      const { data: rep } = await db.from("profiles").select("email").eq("id", sale.salesperson_id).single();
      const { data: admins } = await db.from("profiles").select("email").eq("role", "admin").eq("active", true);
      const to = [...new Set([rep?.email, ...(admins ?? []).map((a) => a.email)].filter(Boolean))] as string[];
      if (to.length) await sendEmail({ from: FROM, to, subject: `${pt.full ? "Paid in full" : "Deposit paid"}: agreement #${sale.number}, ${c.name}`,
        html: emailShell({ preheader: `${pt.received} in QuickBooks.`, body: `<p>${escapeHtml(c.name)} paid ${pt.full ? "in full" : "the deposit"} (${money(sale.deposit)}) on agreement #${sale.number}. Time to place the order with AquaSolus.</p>${button(`${SITE_URL}/staff/#sale-${sale.id}`, "Open in staff portal")}` }) });
    } catch (e) { console.error("sync", sale.number, e); }
  }
  // Balance invoices: mark the balance paid and say thank you.
  const { data: owing } = await db.from("sales").select("*, customers(*)").not("qb_balance_invoice_id", "is", null).is("balance_paid_at", null).neq("status", "cancelled").limit(100);
  const balances = [];
  for (const sale of owing ?? []) {
    try {
      const { balance } = await invoiceBalance(sale.qb_balance_invoice_id);
      if (balance > 0) continue;
      await db.from("sales").update({ balance_paid_at: new Date().toISOString() }).eq("id", sale.id).is("balance_paid_at", null);
      await logEvent(sale.id, "balance_paid", null, { invoice: sale.qb_balance_invoice_id });
      balances.push(sale.number);
      const c = sale.customers;
      await sendEmail({
        from: FROM, to: c.email, reply_to: REPLY_TO, subject: `Paid in full. Thank you, ${firstNameOf(c.name)}.`,
        html: emailShell({ preheader: "Your balance is paid. All that's left is delivery day.", body:
          `<p>Hi ${escapeHtml(firstNameOf(c.name))},</p><p>Thank you, we've received your balance of ${money(sale.balance)}. Your ${escapeHtml(productWhat(sale))} is paid in full, so delivery day is just about getting it in place and getting you into your first Zen Time.</p>
${sale.delivery_window ? `<p>Your delivery window: <b>${escapeHtml(windowLabel(sale.delivery_window))}</b>. I'll call you to set the exact day.</p>` : ""}
<p style="color:${MUTED}">Questions any time? Call or text me at 236-304-4424.</p><p>Shaun</p>` }),
      });
      const { data: admins } = await db.from("profiles").select("email").eq("role", "admin").eq("active", true);
      const to = (admins ?? []).map((a) => a.email).filter(Boolean) as string[];
      if (to.length) await sendEmail({ from: FROM, to, subject: `Balance paid: agreement #${sale.number}, ${c.name}`,
        html: emailShell({ preheader: "Balance received in QuickBooks.", body: `<p>${escapeHtml(c.name)} paid the balance (${money(sale.balance)}) on agreement #${sale.number}. Paid in full.</p>${button(`${SITE_URL}/staff/#sale-${sale.id}`, "Open in staff portal")}` }) });
    } catch (e) { console.error("balance sync", sale.number, e); }
  }
  return new Response(JSON.stringify({ checked: (open ?? []).length, paid, balances }), { headers: { "Content-Type": "application/json" } });
}

const ROUTES: Record<string, (req: Request) => Promise<Response>> = {
  "login-link": route_login_link, "invite-staff": route_invite_staff, "send-for-signature": route_send_for_signature,
  "signing": route_signing, "agreement-pdf": route_agreement_pdf,
  "agreement-print": route_agreement_print, "paper-signed": route_paper_signed,
  "sale-progress": route_sale_progress, "customer-delete": route_customer_delete, "sale-delete": route_sale_delete, "sale-reopen": route_sale_reopen, "past-sale": route_past_sale, "lead-assign": route_lead_assign,
  "qb-status": route_qb_status, "qb-connect": route_qb_connect, "qb-callback": route_qb_callback,
  "qb-settings": route_qb_settings, "qb-invoice": route_qb_invoice, "qb-balance-invoice": route_qb_balance_invoice, "qb-sync": route_qb_sync,
};
Deno.serve(async (req) => {
  const name = new URL(req.url).pathname.split("/").filter(Boolean).pop() ?? "";
  const fn = ROUTES[name];
  if (!fn) return new Response("Not found", { status: 404, headers: corsAuth(req) });
  try { return await fn(req); }
  catch (e) { console.error(name, e); return jsonAuth(req, { error: "Something went wrong on our end. Please try again." }, 500); }
});
