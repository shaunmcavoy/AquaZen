// One edge function for the customer and staff portals. Route = last path segment, e.g. /functions/v1/portal/signing
import { admin, button, FUNCTIONS_URL, payTerms, caller, cors, corsAuth, dataUrlToBytes, emailShell, ensureUser, escapeHtml, firstNameOf, FROM, json, jsonAuth, logEvent, loginLink, money, REPLY_TO, sendEmail, SITE_URL, productNoun, productMaker, productWhat, balanceHow, h, MUTED, windowLabel, windowChoices, validWindow, noonVancouver } from "../_shared/common.ts";
import { buildAgreementPdf, sha256Hex, toBase64 } from "../_shared/pdf.ts";
import { startCheckout, getTransaction, hashMatches, uploadLogo } from "../_shared/helcim.ts";
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
  const role = b.role === "admin" ? "admin" : b.role === "delivery" ? "delivery" : "staff";
  const id = await ensureUser(email, name, role);
  await admin().from("profiles").update({ role, full_name: name, phone: String(b.phone ?? "") || null, active: true }).eq("id", id);
  const link = await loginLink(email, role === "delivery" ? "/staff/#deliveries" : "/staff/");
  await sendEmail({
    from: FROM, to: email, reply_to: REPLY_TO, subject: "Welcome to the AquaZen team",
    html: emailShell({
      preheader: "Your staff account is ready.",
      body: `<p>Hi ${firstNameOf(name)},</p><p>You've been added to the AquaZen team. ${role === "delivery" ? "Your portal shows every delivery coming up, with the address, phone number and what's going out. On delivery day you record the serial number and take a few photos of the tub in place, right from your phone, so the customer's warranty details are on file and they never have to hunt for them." : "Your staff portal is where you write up sales, get agreements signed and follow each tub through to delivery."}</p>
${button(link, "Open the staff portal")}
<p style="color:${MUTED}">${role === "delivery" ? "Every customer should feel looked after from the first call to their first soak, and delivery day is the moment they remember." : role === "admin" ? "As an admin you'll see every customer and deal, so nothing slips through the cracks and every customer gets the same honest, simple experience." : "We run every sale through the portal so every customer gets the same honest, simple experience, and so you can always see where your deals and commission stand."}</p>
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

const PUBLIC_FIELDS = ["number","status","sale_date","product_type","tub_make","tub_model","shell_colour","siding","water_care","stereo","starter_kit","steps","lifter","spa_cover","other","est_delivery","hot_tub_value","sauna_make","sauna_model","sauna_electrical","sauna_total","notes","delivery_fee","tax_rate","tax","total","deposit","balance","payment_type","pay_methods","balance_method","rep_name","rep_signed_at","terms_version","delivery_window","msrp","zen_price","extras","extras_total"];

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
    ? `<p>${why} You can pay securely online by card, right from your phone or computer:</p>${button(link, p.button)}`
    : `<p>${why} I'll be in touch about payment.</p>`;
}

// Everything that happens once an agreement is signed, online or on paper:
// QuickBooks deposit invoice, welcome email with delivery prep and the portal, and a notice to the salesperson and admins.
async function afterSigned(sale: any, c: any, pdfBytes: Uint8Array, method: "online" | "paper") {
  const db = admin();
  // The customer's own pay page (Helcim card form), so the welcome email and signing page can carry a Pay now button.
  let payLink: string | null = null, invoiceProblem = "";
  try { if (amountDue({ ...sale, status: "signed" })) payLink = await payLinkFor(sale); }
  catch (e) { console.error("pay link", e); invoiceProblem = String((e as Error).message ?? e); }

  // Congratulations, from the salesperson who sold it: both guides attached, and how to set up their account.
  const setup = await loginLink(c.email, "/login/?setpw=1");
  const what = productWhat(sale);
  const pt = payTerms(sale);
  const { data: seller } = await db.from("profiles").select("full_name, email").eq("id", sale.salesperson_id ?? "").maybeSingle();
  const repName = (seller?.full_name || sale.rep_name || "Shaun McAvoy").trim();
  const repFirst = firstNameOf(repName) || "Shaun";
  const repEmail = seller?.email || REPLY_TO;
  const local = (repEmail.split("@")[0] || "shaun").toLowerCase().replace(/[^a-z0-9._-]/g, "") || "shaun";
  try {
    await sendEmail({
      from: `${repFirst} at AquaZen <${local}@mail.aquazen.ca>`, to: c.email, reply_to: repEmail,
      subject: `Congratulations, ${firstNameOf(c.name)}. Your Zen Time starts here.`,
      html: emailShell({
        preheader: "Your signed agreement, pre-delivery guide and owner's manual are attached, plus how to set up your account.",
        body: `<p>Hi ${escapeHtml(firstNameOf(c.name))},</p>
<p style="font-size:24px;font-weight:600;letter-spacing:-0.01em;margin:0 0 10px">Congratulations.</p>
<p>You've just made room in your life for a place of peace at home. A place to slow down, recover and reconnect with yourself and the people you love, every single day. I'm really glad I got to help you find it, and you picked a great ${productNoun(sale)}.</p>
<p>Thank you for trusting me with your ${escapeHtml(what)}. ${method === "paper" ? `You have your signed paper copy, and a digital copy of agreement #${sale.number} is attached so it's always easy to find.` : `Your signed agreement (#${sale.number}) is attached for your records.`}</p>
${sale.delivery_window ? `${h("Your delivery window")}<p><b>${escapeHtml(windowLabel(sale.delivery_window))}</b>. ${sale.delivery_window === "asap" ? "We'll get your order moving right away and call you to set the day." : "We'll call you as that window gets close to set the exact day."} Need to change it? Just call or text me.</p>` : ""}
${h("Set up your account")}
<p>Your AquaZen account is where everything lives: your agreement, your ${productNoun(sale)}'s details, where your order stands, your delivery photos and serial number, our water care guides, and the button to request service if you ever need it. It's the fastest way to reach us, and nothing gets lost in an inbox.</p>
<p><b>1.</b> Tap <b>Set up my account</b> below.<br>
<b>2.</b> Choose a password.<br>
<b>3.</b> That's it. From now on, sign in any time at <b>aquazen.ca/login</b> with this email address and your password.</p>
${button(setup, "Set up my account")}
<p style="color:${MUTED};font-size:14px">For your security the button works once and expires in an hour. If it has expired, go to aquazen.ca/login, enter this email and tap "Email me a link to set my password".</p>
${h("Your two guides (attached)")}
<p><b>Your pre-delivery guide.</b> Please read it before we book your delivery. A solid, level base, a clear path from the street and a plan for the power are what make delivery day smooth, and they protect your warranty. It also introduces Gerry Jansen, our electrical partner. We recommend having him wire your ${productNoun(sale)} after delivery, so he only has to come once. Twenty minutes with the guide now saves a rescheduled delivery later.</p>
<p><b>Your owner's manual.</b> This one's for after delivery: water care, filters and your control panel. Your ${productNoun(sale)} does most of the work, so looking after it takes a few minutes a week and your time goes into enjoying it.</p>
${h(pt.full ? "Your payment" : "Your deposit")}
${payWhy(sale, payLink)}
<p style="color:${MUTED}">I don't think of this as a one-time sale. We set you up with the right equipment from day one so your water stays clean and easy, and you spend your time enjoying it, not fixing it. Call or text us any time at 236-304-4424, or just reply to this email.</p>
<p>${escapeHtml(repFirst)}</p>`,
      }),
      attachments: [
        { filename: `AquaZen Sales Agreement #${sale.number}.pdf`, content: toBase64(pdfBytes) },
        { filename: "AquaZen Pre-Delivery Guide.pdf", path: `${SITE_URL}/assets/docs/aquazen-pre-delivery-guide.pdf` },
        { filename: "AquaZen Owner's Manual.pdf", path: `${SITE_URL}/assets/docs/aquazen-owners-manual.pdf` },
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
        `<p>${escapeHtml(c.name)} ${method === "paper" ? "signed on paper:" : "just signed"} agreement #${sale.number} for the ${escapeHtml(what)}. Total ${money(sale.total)}. They agreed to pay ${pt.full ? "in full" : `a deposit of ${money(sale.deposit)}`} ${pt.how}.</p>
${Number(sale.deposit) > 0 ? `<p><b>Payment isn't in yet.</b> You'll get a separate "${pt.full ? "Paid in full" : "Deposit paid"}" email the moment their card payment goes through. Until then, don't order from the manufacturer. If their card is declined, you'll get an email about that too.</p>` : ""}
<p>Delivery window: <b>${escapeHtml(windowLabel(sale.delivery_window) || "not chosen")}</b>.</p><p>They've been sent their signed copy, how to get their spot ready and a link to their portal.</p>
${Number(sale.deposit) > 0 && !payLink ? `<p style="background:#fff4e5;border-radius:10px;padding:12px 14px"><b>No pay link went to the customer.</b> ${escapeHtml(invoiceProblem || "The pay link couldn't be created.")} Once that's sorted, open the sale and tap "Email pay link to customer".</p>` : ""}${button(`${SITE_URL}/staff/#sale-${sale.id}`, "Open in staff portal")}` }),
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
  if (!b.preview) await logEvent(sale.id, "printed_for_paper", me!.user.id);
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
<p>Please make sure the base is finished and level and the path from the street is clear. That's what lets us set your ${productNoun(sale)} in place without a hitch. If it's already wired, we'll fill it and get it heating the same day. If Gerry is wiring it after delivery, it gets filled once he's connected it. The checklist on page 7 of your <a href="${SITE_URL}/assets/docs/aquazen-pre-delivery-guide.pdf">pre-delivery guide</a> covers everything.</p>
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

// ---- Menu access: what each person can open in the staff portal (profiles.menus, NULL = role default) ----
// Keep in step with MENUS in assets/js/staff.js and has_menu() in 011_menu_access.sql.
const MENU_DEFAULTS: Record<string, string[]> = {
  staff: ["customers", "sales", "new", "deliveries", "service", "resources"],
  delivery: ["deliveries", "resources"],
};
// What an admin can give each role. Financials, Products and Team stay admin only (true costs, team settings).
const MENU_ALLOWED: Record<string, string[]> = {
  staff: ["customers", "sales", "new", "deliveries", "service", "resources", "ads", "adresults", "noah"],
  delivery: ["deliveries", "service", "resources"],
};
// deno-lint-ignore no-explicit-any
function hasMenu(me: any, key: string) {
  if (!me) return false;
  if (me.profile.role === "admin") return true;
  const list: string[] = me.profile.menus ?? MENU_DEFAULTS[me.profile.role] ?? [];
  return list.includes(key) && (MENU_ALLOWED[me.profile.role] ?? []).includes(key);
}
async function menuOnly(req: Request, key: string) {
  const me = await caller(req);
  return hasMenu(me, key) ? me : null;
}

// POST {user_id, menus: string[] | null}  Admin chooses which menus a team member sees (null = back to the default).
async function route_team_menus(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsAuth(req) });
  const me = await adminOnly(req);
  if (!me) return jsonAuth(req, { error: "Only an admin can change what people see." }, 403);
  const b = await req.json().catch(() => ({}));
  const db = admin();
  const { data: p } = await db.from("profiles").select("id, role").eq("id", String(b.user_id ?? "")).maybeSingle();
  if (!p || !MENU_ALLOWED[p.role]) return jsonAuth(req, { error: "Admins always see everything. Choose a salesperson or delivery team member." }, 400);
  const menus = b.menus === null ? null : (Array.isArray(b.menus) ? b.menus : []).map(String).filter((k: string) => MENU_ALLOWED[p.role].includes(k));
  const { error } = await db.from("profiles").update({ menus: menus && [...new Set(menus)] }).eq("id", p.id);
  if (error) return jsonAuth(req, { error: "Couldn't save that. Please try again." }, 500);
  return jsonAuth(req, { ok: true, menus });
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

// QuickBooks never tells us a card was declined, but it does tell us the customer opened the pay page.
// Opened and still unpaid an hour later almost always means declined (large purchases often are) or abandoned.
// So, once per invoice, we send the customer a gentle note on how to fix it, and tell the salesperson and admins.
// Customers whose payment goes through never see any of this.
const NUDGE_AFTER_MS = 60 * 60 * 1000;
// deno-lint-ignore no-explicit-any
async function nudgeIfStuck(sale: any, invoiceId: string, link: string | null, amount: number, noun: string) {
  const db = admin();
  const { data: evs } = await db.from("sale_events").select("kind, at").eq("sale_id", sale.id)
    .in("kind", ["pay_page_viewed", "payment_nudge_sent"]).eq("detail->>invoice", invoiceId);
  if ((evs ?? []).some((e) => e.kind === "payment_nudge_sent")) return;
  const seen = (evs ?? []).find((e) => e.kind === "pay_page_viewed");
  if (!seen) { await logEvent(sale.id, "pay_page_viewed", null, { invoice: invoiceId }); return; }
  if (Date.now() - new Date(seen.at).getTime() < NUDGE_AFTER_MS || !link) return;
  await logEvent(sale.id, "payment_nudge_sent", null, { invoice: invoiceId });
  const c = sale.customers;
  try {
    await sendEmail({
      from: FROM, to: c.email, reply_to: REPLY_TO, subject: `A quick note about your ${noun} for agreement #${sale.number}`,
      html: emailShell({ preheader: `Your ${money(amount)} ${noun} hasn't come through yet. Here's the easy fix.`, body:
        `<p>Hi ${escapeHtml(firstNameOf(c.name))},</p>
<p>It looks like your ${noun} of ${money(amount)} hasn't come through yet.</p>
<p>If your card was declined, that's very common with a purchase this size. Card companies often hold a larger payment than usual to protect you from fraud. A quick call to the number on the back of your card to approve it sorts it out, and then you can pay with the same button below.</p>
${button(link, `Pay my ${noun}`)}
<p style="color:${MUTED}">If you just haven't got to it yet, no worries at all. The button is ready whenever you are. Questions? Call or text me at 236-304-4424.</p><p>Shaun</p>` }),
    });
  } catch (e) { console.error("nudge customer", sale.number, e); }
  try {
    const { data: rep } = await db.from("profiles").select("email").eq("id", sale.salesperson_id ?? "").maybeSingle();
    const { data: admins } = await db.from("profiles").select("email").eq("role", "admin").eq("active", true);
    const to = [...new Set([rep?.email, ...(admins ?? []).map((a) => a.email)].filter(Boolean))] as string[];
    if (to.length) await sendEmail({ from: FROM, to, subject: `Payment not in yet: agreement #${sale.number}, ${c.name}`,
      html: emailShell({ preheader: `${c.name} opened the pay page over an hour ago but hasn't paid.`, body:
        `<p>${escapeHtml(c.name)} opened the pay page for their ${money(amount)} ${noun} on agreement #${sale.number} over an hour ago, but QuickBooks hasn't received it. Their card may have been declined, which is common on a purchase this size.</p>
<p>We've sent them a friendly note: call their card company to approve it, then use the same pay button. A quick call from you usually helps too.</p>${button(`${SITE_URL}/staff/#sale-${sale.id}`, "Open in staff portal")}` }) });
  } catch (e) { console.error("nudge staff", sale.number, e); }
}

// The deposit (or full payment) is in: move the sale on, thank the customer, tell the salesperson and admins.
// Used by QuickBooks sync (older sales) and by Helcim card payments. Safe to call twice: only the first moves the sale.
// deno-lint-ignore no-explicit-any
async function markDepositPaid(sale: any, detail: Record<string, unknown>) {
  const db = admin();
  const now = new Date().toISOString();
  const { data: moved } = await db.from("sales").update({ status: "deposit_paid", deposit_paid_at: now }).eq("id", sale.id).eq("status", "signed").select("id");
  if (!moved?.length) return false;
  await logEvent(sale.id, "deposit_paid", null, detail);
  const c = sale.customers;
  const what = productWhat(sale);
  const portal = await loginLink(c.email, "/portal/");
  const pt = payTerms(sale);
  try {
    await sendEmail({
      from: FROM, to: c.email, reply_to: REPLY_TO, subject: `${pt.received}. Your ${productNoun(sale)} is on order.`,
      html: emailShell({ preheader: "Thank you. Here's what happens next.", body:
        `<p>Hi ${escapeHtml(firstNameOf(c.name))},</p><p>Thank you, we've received your ${money(sale.deposit)} ${pt.full ? "payment. You're paid in full, and your" : "deposit. Your"} ${escapeHtml(what)} is now on order with ${escapeHtml(productMaker(sale))}.</p>
${h("What to do while you wait")}
<p>This is the perfect time to get your spot ready: a solid, level base, a clear path to the backyard, and a plan for the power. Gerry Jansen, our electrical partner, can wire it before or after delivery (we recommend after, so he only comes once). Call or text him at 778-229-2560. Having these done before your ${productNoun(sale)} arrives is what makes delivery day quick and easy, and it protects your warranty.</p>
${sale.delivery_window ? `<p>Your delivery window: <b>${escapeHtml(windowLabel(sale.delivery_window))}</b>.</p>` : ""}
${button(portal, "Open my portal")}
<p style="color:${MUTED}">I'll be in touch to set the exact delivery day.${pt.full ? "" : ` Your remaining balance of ${money(sale.balance)} is due before delivery.`} Questions any time? Call or text me at 236-304-4424.</p><p>Shaun</p>` }),
    });
  } catch (e) { console.error("paid email customer", sale.number, e); }
  try {
    const { data: rep } = await db.from("profiles").select("email").eq("id", sale.salesperson_id ?? "").maybeSingle();
    const { data: admins } = await db.from("profiles").select("email").eq("role", "admin").eq("active", true);
    const to = [...new Set([rep?.email, ...(admins ?? []).map((a) => a.email)].filter(Boolean))] as string[];
    if (to.length) await sendEmail({ from: FROM, to, subject: `${pt.full ? "Paid in full" : "Deposit paid"}: agreement #${sale.number}, ${c.name}`,
      html: emailShell({ preheader: `${pt.received}.`, body: `<p>${escapeHtml(c.name)} paid ${pt.full ? "in full" : "the deposit"} (${money(sale.deposit)}) on agreement #${sale.number}. Time to place the order with AquaSolus.</p>${button(`${SITE_URL}/staff/#sale-${sale.id}`, "Open in staff portal")}` }) });
  } catch (e) { console.error("paid email staff", sale.number, e); }
  return true;
}

// The balance is in: record it, thank the customer and tell the admins. Safe to call twice.
// deno-lint-ignore no-explicit-any
async function markBalancePaid(sale: any, detail: Record<string, unknown>) {
  const db = admin();
  const { data: moved } = await db.from("sales").update({ balance_paid_at: new Date().toISOString() }).eq("id", sale.id).is("balance_paid_at", null).select("id");
  if (!moved?.length) return false;
  await logEvent(sale.id, "balance_paid", null, detail);
  const c = sale.customers;
  try {
    await sendEmail({
      from: FROM, to: c.email, reply_to: REPLY_TO, subject: `Paid in full. Thank you, ${firstNameOf(c.name)}.`,
      html: emailShell({ preheader: "Your balance is paid. All that's left is delivery day.", body:
        `<p>Hi ${escapeHtml(firstNameOf(c.name))},</p><p>Thank you, we've received your balance of ${money(sale.balance)}. Your ${escapeHtml(productWhat(sale))} is paid in full, so delivery day is just about getting it in place and getting you into your first Zen Time.</p>
${sale.delivery_window ? `<p>Your delivery window: <b>${escapeHtml(windowLabel(sale.delivery_window))}</b>. I'll call you to set the exact day.</p>` : ""}
<p style="color:${MUTED}">Questions any time? Call or text me at 236-304-4424.</p><p>Shaun</p>` }),
    });
  } catch (e) { console.error("balance email customer", sale.number, e); }
  try {
    const { data: admins } = await db.from("profiles").select("email").eq("role", "admin").eq("active", true);
    const to = (admins ?? []).map((a) => a.email).filter(Boolean) as string[];
    if (to.length) await sendEmail({ from: FROM, to, subject: `Balance paid: agreement #${sale.number}, ${c.name}`,
      html: emailShell({ preheader: "Balance received.", body: `<p>${escapeHtml(c.name)} paid the balance (${money(sale.balance)}) on agreement #${sale.number}. Paid in full.</p>${button(`${SITE_URL}/staff/#sale-${sale.id}`, "Open in staff portal")}` }) });
  } catch (e) { console.error("balance email staff", sale.number, e); }
  return true;
}

// ---- Helcim card payments ----
// Each sale has a /pay/?t=<pay_token> page. What it charges is worked out here from the sale, never sent by the browser:
// the deposit (or full payment) while the sale is signed, then the balance once the deposit is in.
// deno-lint-ignore no-explicit-any
function amountDue(sale: any): { kind: "deposit" | "balance"; amount: number } | null {
  if (sale.status === "signed" && !sale.deposit_paid_at && Number(sale.deposit) > 0) return { kind: "deposit", amount: Number(sale.deposit) };
  if (["deposit_paid", "delivery_scheduled", "delivered"].includes(sale.status) && !sale.balance_paid_at && Number(sale.balance) > 0 && sale.balance_method === "before_delivery")
    return { kind: "balance", amount: Number(sale.balance) };
  return null;
}

// The sale's pay page link, creating its token the first time.
// deno-lint-ignore no-explicit-any
async function payLinkFor(sale: any): Promise<string> {
  let tok = sale.pay_token;
  if (!tok) {
    tok = crypto.randomUUID();
    const { data } = await admin().from("sales").update({ pay_token: tok }).eq("id", sale.id).is("pay_token", null).select("pay_token");
    if (!data?.length) {
      const { data: again } = await admin().from("sales").select("pay_token").eq("id", sale.id).single();
      tok = again?.pay_token;
    }
    sale.pay_token = tok;
  }
  return `${SITE_URL}/pay/?t=${tok}`;
}

// GET ?t=  what's owing (for the pay page).  POST {t, action: "start"} opens a Helcim checkout for it.
// POST {t, action: "confirm", checkout_token, message} checks the payment with Helcim and marks it paid.
// POST {t, action: "declined", checkout_token, message} records a decline and lets staff know.
async function route_pay(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  const db = admin();
  const loadSale = async (t: string) => {
    if (!/^[0-9a-f-]{36}$/i.test(t)) return null;
    const { data } = await db.from("sales").select("*, customers(*)").eq("pay_token", t).neq("status", "cancelled").maybeSingle();
    return data;
  };
  if (req.method === "GET") {
    const sale = await loadSale(new URL(req.url).searchParams.get("t") ?? "");
    if (!sale) return json(req, { error: "This payment link isn't valid. Call or text Shaun at 236-304-4424." }, 404);
    const due = amountDue(sale), pt = payTerms(sale);
    return json(req, {
      number: sale.number, first_name: firstNameOf(sale.customers?.name ?? ""), what: productWhat(sale),
      due: due ? { kind: due.kind, amount: due.amount, label: due.kind === "balance" ? "your balance" : pt.full ? "your payment in full" : "your deposit" } : null,
      deposit_paid: !!sale.deposit_paid_at, balance_paid: !!sale.balance_paid_at, total: Number(sale.total),
    });
  }
  const b = await req.json().catch(() => ({}));
  const sale = await loadSale(String(b.t ?? ""));
  if (!sale) return json(req, { error: "This payment link isn't valid. Call or text Shaun at 236-304-4424." }, 404);
  const action = String(b.action ?? "");

  if (action === "start") {
    const due = amountDue(sale);
    if (!due) return json(req, { error: "There's nothing to pay on this agreement right now.", nothing_due: true }, 409);
    try {
      const s = await startCheckout(due.amount);
      await db.from("payment_sessions").insert({ sale_id: sale.id, kind: due.kind, amount: due.amount, checkout_token: s.checkoutToken, secret_token: s.secretToken });
      await logEvent(sale.id, "pay_started", null, { kind: due.kind, amount: due.amount });
      return json(req, { checkout_token: s.checkoutToken, amount: due.amount, kind: due.kind });
    } catch (e) {
      console.error("pay start", sale.number, e);
      return json(req, { error: "We couldn't open the secure card form. Please try again in a minute, or call or text Shaun at 236-304-4424." }, 502);
    }
  }

  const { data: sess } = await db.from("payment_sessions").select("*").eq("checkout_token", String(b.checkout_token ?? "")).eq("sale_id", sale.id).maybeSingle();
  if (!sess) return json(req, { error: "We couldn't match this payment. Call or text Shaun at 236-304-4424 and we'll sort it out." }, 404);
  // deno-lint-ignore no-explicit-any
  let msg: any = b.message;
  try { if (typeof msg === "string") msg = JSON.parse(msg); } catch { /* not JSON: a plain message */ }

  if (action === "declined") {
    const reason = typeof msg === "string" ? msg : (msg?.data?.data?.responseMessage ?? msg?.data?.responseMessage ?? "");
    await logEvent(sale.id, "card_declined", null, { kind: sess.kind, amount: Number(sess.amount), reason: String(reason).slice(0, 200) });
    try {
      const c = sale.customers;
      const { data: rep } = await db.from("profiles").select("email").eq("id", sale.salesperson_id ?? "").maybeSingle();
      const { data: admins } = await db.from("profiles").select("email").eq("role", "admin").eq("active", true);
      const to = [...new Set([rep?.email, ...(admins ?? []).map((a) => a.email)].filter(Boolean))] as string[];
      if (to.length) await sendEmail({ from: FROM, to, subject: `Card declined: agreement #${sale.number}, ${c.name}`,
        html: emailShell({ preheader: `${c.name}'s card was declined for ${money(sess.amount)}.`, body:
          `<p>${escapeHtml(c.name)} tried to pay ${money(sess.amount)} on agreement #${sale.number} and the card was declined${reason ? ` (Helcim says: ${escapeHtml(String(reason))})` : ""}.</p>
<p>The pay page has already told them what to do: call the number on the back of their card to approve the purchase, then try again with the same link. A quick call from you usually helps.</p>${button(`${SITE_URL}/staff/#sale-${sale.id}`, "Open in staff portal")}` }) });
    } catch (e) { console.error("declined email", sale.number, e); }
    return json(req, { ok: true });
  }

  if (action === "confirm") {
    if (sess.paid_at) return json(req, { ok: true, already: true });
    const data = msg?.data?.data ?? msg?.data ?? null;
    const txnId = data?.transactionId;
    if (!txnId) return json(req, { error: "We couldn't read the payment result. Call or text Shaun at 236-304-4424 before trying again." }, 400);
    const hashOk = await hashMatches(data, msg?.data?.hash, sess.secret_token).catch(() => false);
    // Helcim is the source of truth: look the transaction up ourselves.
    // deno-lint-ignore no-explicit-any
    let t: any;
    try { t = await getTransaction(txnId); } catch (e) {
      console.error("pay confirm lookup", sale.number, e);
      return json(req, { error: "Your payment went to Helcim, but we couldn't confirm it just now. Please don't pay again. Shaun will confirm it and be in touch." }, 502);
    }
    const ok = String(t.status).toUpperCase() === "APPROVED" && String(t.type ?? "purchase") === "purchase" &&
      Math.abs(Number(t.amount) - Number(sess.amount)) < 0.005 && String(t.currency ?? "CAD").toUpperCase() === "CAD";
    if (!ok) {
      await logEvent(sale.id, "pay_mismatch", null, { txn: txnId, status: t.status, amount: t.amount, expected: Number(sess.amount) });
      return json(req, { error: "This payment wasn't approved. Please try again, or call or text Shaun at 236-304-4424." }, 409);
    }
    const { data: claimed } = await db.from("payment_sessions").update({
      transaction_id: String(txnId), paid_at: new Date().toISOString(),
      card_type: data?.cardType ?? t.cardType ?? null, card_last4: String(data?.cardNumber ?? t.cardNumber ?? "").slice(-4) || null,
    }).eq("id", sess.id).is("paid_at", null).select("id");
    if (!claimed?.length) return json(req, { ok: true, already: true });
    const detail = { via: "helcim", txn: String(txnId), amount: Number(sess.amount), hash_ok: hashOk };
    if (sess.kind === "deposit") await markDepositPaid(sale, detail);
    else await markBalancePaid(sale, detail);
    return json(req, { ok: true });
  }
  return json(req, { error: "Unknown action." }, 400);
}

// ---- helcim-logo ----
// POST {}  Admin. Uploads the AquaZen logo (assets/img/logo-dark-square.jpg on the site) to show on the HelcimPay.js card form.
async function route_helcim_logo(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsAuth(req) });
  const me = await caller(req);
  if (!me || me.profile.role !== "admin") return jsonAuth(req, { error: "Admins only." }, 403);
  const r = await fetch(`${SITE_URL}/assets/img/logo-dark-square.jpg`);
  if (!r.ok) return jsonAuth(req, { error: "Couldn't load the logo from the website." }, 502);
  const bytes = new Uint8Array(await r.arrayBuffer());
  try { return jsonAuth(req, { ok: true, helcim: await uploadLogo(bytes, "aquazen-logo.jpg", "image/jpeg") }); }
  catch (e) { return jsonAuth(req, { error: String((e as Error).message ?? e) }, 502); }
}

// ---- pay-link ----
// POST {sale_id, email_customer}  Staff. The sale's pay page link, and optionally emails it to the customer
// for whatever is owing now (deposit or balance).
async function route_pay_link(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsAuth(req) });
  const b = await req.json().catch(() => ({}));
  const r0 = await staffSale(req, String(b.sale_id ?? ""));
  if (r0.err) return r0.err;
  const { me, sale } = r0;
  const due = amountDue(sale);
  if (!due) return jsonAuth(req, { error: sale.status === "awaiting_customer" || sale.status === "draft" ? "The pay link is ready once the customer signs." : "Nothing is owing on this sale right now." }, 409);
  const link = await payLinkFor(sale);
  if (b.email_customer) {
    const c = sale.customers;
    const body = due.kind === "deposit"
      ? payWhy(sale, link)
      : `<p>Your ${escapeHtml(productWhat(sale))} is getting close. Your remaining balance is <b>${money(sale.balance)}</b>. Paying it before delivery means delivery day is only about getting you soaking, with nothing to sort out at the door.</p>
${sale.delivery_window ? `<p>Your delivery window: <b>${escapeHtml(windowLabel(sale.delivery_window))}</b>.</p>` : ""}
<p>You can pay securely online by card, right from your phone or computer:</p>${button(link, "Pay my balance")}`;
    await sendEmail({
      from: FROM, to: c.email, reply_to: REPLY_TO, subject: due.kind === "deposit" ? `Your ${payTerms(sale).noun} for agreement #${sale.number}` : `Your balance for agreement #${sale.number}`,
      html: emailShell({ preheader: due.kind === "deposit" ? `Pay your ${payTerms(sale).noun} securely online.` : "Pay your balance securely online before delivery.", body:
        `<p>Hi ${escapeHtml(firstNameOf(c.name))},</p>${body}<p style="color:${MUTED}">Questions? Call or text me at 236-304-4424.</p><p>Shaun</p>` }),
    });
    await logEvent(sale.id, due.kind === "deposit" ? "pay_link_emailed" : "balance_link_emailed", me!.user.id, { to: c.email });
  }
  return jsonAuth(req, { ok: true, link, kind: due.kind, amount: due.amount });
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
      const { balance, viewed } = await invoiceBalance(sale.qb_deposit_invoice_id);
      if (balance > 0) { if (viewed) await nudgeIfStuck(sale, sale.qb_deposit_invoice_id, sale.qb_invoice_link, Number(sale.deposit), payTerms(sale).noun); continue; }
      if (await markDepositPaid(sale, { invoice: sale.qb_deposit_invoice_id, via: "quickbooks" })) paid.push(sale.number);
    } catch (e) { console.error("sync", sale.number, e); }
  }
  // Balance invoices: mark the balance paid and say thank you.
  const { data: owing } = await db.from("sales").select("*, customers(*)").not("qb_balance_invoice_id", "is", null).is("balance_paid_at", null).neq("status", "cancelled").limit(100);
  const balances = [];
  for (const sale of owing ?? []) {
    try {
      const { balance, viewed } = await invoiceBalance(sale.qb_balance_invoice_id);
      if (balance > 0) { if (viewed) await nudgeIfStuck(sale, sale.qb_balance_invoice_id, sale.qb_balance_link, Number(sale.balance), "balance"); continue; }
      if (await markBalancePaid(sale, { invoice: sale.qb_balance_invoice_id, via: "quickbooks" })) balances.push(sale.number);
    } catch (e) { console.error("balance sync", sale.number, e); }
  }
  return new Response(JSON.stringify({ checked: (open ?? []).length, paid, balances }), { headers: { "Content-Type": "application/json" } });
}


// ---- Delivery team ----
// The delivery team (role 'delivery'), admins and salespeople (their own deals) see upcoming deliveries,
// record the serial number, add photos of the tub in place and mark it delivered.
// deno-lint-ignore no-explicit-any
async function deliveryCaller(req: Request): Promise<any> {
  const me = await caller(req);
  if (!me || !["admin", "staff", "delivery"].includes(me.profile.role) || !hasMenu(me, "deliveries")) return null;
  return me;
}
// deno-lint-ignore no-explicit-any
function canDeliver(me: any, sale: any) { return me.profile.role !== "staff" || sale.salesperson_id === me.user.id; }
const signedUrls = async (paths: string[]) => {
  if (!paths?.length) return [];
  const { data } = await admin().storage.from("agreements").createSignedUrls(paths, 3600);
  return (data ?? []).map((d) => d.signedUrl).filter(Boolean);
};
function readPhotos(raw: unknown, max: number): { bytes: Uint8Array; type: string }[] | string {
  const out: { bytes: Uint8Array; type: string }[] = [];
  for (const d of (Array.isArray(raw) ? raw : []).slice(0, max)) {
    const m = /^data:(image\/(?:jpeg|png));base64,([A-Za-z0-9+/=]+)$/.exec(String(d));
    if (!m) return "Photos must be JPG or PNG images.";
    const bin = atob(m[2]);
    if (bin.length > 4_000_000) return "One of the photos is too large. Try again.";
    out.push({ bytes: Uint8Array.from(bin, (ch) => ch.charCodeAt(0)), type: m[1] });
  }
  return out;
}

// POST {}  Upcoming deliveries (paid or booked) and anything delivered in the last two weeks.
async function route_deliveries(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsAuth(req) });
  const me = await deliveryCaller(req);
  if (!me) return jsonAuth(req, { error: "Please sign in as staff." }, 401);
  const since = new Date(Date.now() - 14 * 864e5).toISOString();
  let q = admin().from("sales").select("id, number, status, salesperson_id, product_type, tub_make, tub_model, shell_colour, siding, spa_cover, steps, lifter, extras, delivery_window, delivery_date, delivered_at, serial_number, delivery_notes, delivery_photo_paths, balance, balance_paid_at, customers(name, address, city_pc, cell)")
    .or(`status.in.(signed,deposit_paid,delivery_scheduled),and(status.eq.delivered,delivered_at.gte.${since})`)
    .order("delivery_date", { ascending: true, nullsFirst: false }).limit(200);
  if (me.profile.role === "staff") q = q.eq("salesperson_id", me.user.id);
  const { data, error } = await q;
  if (error) return jsonAuth(req, { error: "Couldn't load deliveries." }, 500);
  const rows = [];
  for (const s of data ?? []) rows.push({ ...s, photos: await signedUrls(s.delivery_photo_paths ?? []) });
  return jsonAuth(req, { deliveries: rows, role: me.profile.role });
}

// POST {sale_id, serial_number?, notes?, photos?: [dataUrl], delivered?: boolean}
async function route_delivery_record(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsAuth(req) });
  const me = await deliveryCaller(req);
  if (!me) return jsonAuth(req, { error: "Please sign in as staff." }, 401);
  const b = await req.json().catch(() => ({}));
  const db = admin();
  const { data: sale } = await db.from("sales").select("*, customers(*)").eq("id", String(b.sale_id ?? "")).maybeSingle();
  if (!sale) return jsonAuth(req, { error: "Sale not found." }, 404);
  if (!canDeliver(me, sale)) return jsonAuth(req, { error: "This isn't your sale." }, 403);
  if (["draft", "awaiting_customer", "cancelled"].includes(sale.status)) return jsonAuth(req, { error: "This sale hasn't been signed yet." }, 409);
  const photos = readPhotos(b.photos, 8);
  if (typeof photos === "string") return jsonAuth(req, { error: photos }, 400);
  const paths: string[] = [...(sale.delivery_photo_paths ?? [])];
  if (paths.length + photos.length > 16) return jsonAuth(req, { error: "That's plenty of photos for one delivery (16 at most)." }, 400);
  const stamp = Date.now();
  for (let i = 0; i < photos.length; i++) {
    const path = `${sale.id}/delivery-${stamp}-${i + 1}.${photos[i].type === "image/png" ? "png" : "jpg"}`;
    const up = await db.storage.from("agreements").upload(path, photos[i].bytes, { contentType: photos[i].type, upsert: true });
    if (up.error) return jsonAuth(req, { error: "A photo didn't upload. Please try again." }, 500);
    paths.push(path);
  }
  const patch: Record<string, unknown> = { delivery_photo_paths: paths };
  if (b.serial_number !== undefined) patch.serial_number = String(b.serial_number ?? "").trim().slice(0, 80) || null;
  if (b.notes !== undefined) patch.delivery_notes = String(b.notes ?? "").trim().slice(0, 2000) || null;
  const delivering = b.delivered === true && sale.status !== "delivered";
  if (delivering) {
    const finalSerial = "serial_number" in patch ? patch.serial_number : sale.serial_number;
    if (!String(finalSerial ?? "").trim()) return jsonAuth(req, { error: "Add the serial number before marking it delivered. It's on the label inside the equipment bay." }, 400);
    Object.assign(patch, { status: "delivered", delivered_at: new Date().toISOString(), delivered_by: me.user.id });
  }
  const { error } = await db.from("sales").update(patch).eq("id", sale.id);
  if (error) return jsonAuth(req, { error: "Couldn't save the delivery." }, 500);
  await logEvent(sale.id, delivering ? "delivered" : "delivery_updated", me.user.id, { serial: patch.serial_number ?? sale.serial_number ?? null, photos: photos.length });
  // Welcome to Zen Time: tell the customer their warranty details are safely on file, and where to find help.
  if (delivering && sale.customers?.email) {
    const c = sale.customers;
    try {
      const link = await loginLink(c.email, "/portal/");
      await sendEmail({
        from: FROM, to: c.email, reply_to: REPLY_TO, subject: "Welcome to Zen Time",
        html: emailShell({ preheader: "Your hot tub is in. Your serial number and photos are on file.", body:
          `<p>Hi ${escapeHtml(firstNameOf(c.name))},</p><p>Your ${escapeHtml(productWhat(sale))} is in and your Zen Time starts tonight. Thank you for trusting us with it.</p>
${h("Your warranty details are on file")}
<p>Our delivery team recorded your serial number${("serial_number" in patch ? patch.serial_number : sale.serial_number) ? ` (<b>${escapeHtml(String("serial_number" in patch ? patch.serial_number : sale.serial_number))}</b>)` : ""} and took photos of your ${productNoun(sale)} in place. They're saved in your portal, so if you ever need warranty work you won't have to go looking for anything.</p>
${h("Everything in one place")}
<p>Your portal has water care guides, answers to the questions new owners ask most, and a button to request service. Your <a href="${SITE_URL}/assets/docs/aquazen-owners-manual.pdf">owner's manual</a> has the full routine and your control panel. A few minutes of care each week keeps your water clear and soft, so your time in the tub is just for relaxing.</p>
${button(link, "Open my portal")}
<p style="color:${MUTED}">Anything at all, call or text me at 236-304-4424.</p><p>Shaun</p>` }),
      });
      await logEvent(sale.id, "delivered_emailed", me.user.id, { to: c.email });
    } catch (e) { console.error("delivered email", e); }
  }
  return jsonAuth(req, { ok: true, photos: await signedUrls(paths), status: delivering ? "delivered" : sale.status });
}

// ---- Customer portal: delivery photos and service requests ----
// deno-lint-ignore no-explicit-any
async function customerSales(me: any): Promise<{ ids: string[]; customers: any[] }> {
  const { data } = await admin().from("customers").select("*").eq("user_id", me.user.id);
  return { ids: (data ?? []).map((c) => c.id), customers: data ?? [] };
}

// POST {sale_id}  The customer (or staff) gets their delivery photos and service history.
async function route_portal_details(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsAuth(req) });
  const me = await caller(req);
  if (!me) return jsonAuth(req, { error: "Please sign in." }, 401);
  const b = await req.json().catch(() => ({}));
  const db = admin();
  const { data: sale } = await db.from("sales").select("id, customer_id, salesperson_id, delivery_photo_paths").eq("id", String(b.sale_id ?? "")).maybeSingle();
  if (!sale) return jsonAuth(req, { error: "Not found." }, 404);
  const mine = (await customerSales(me)).ids.includes(sale.customer_id);
  if (!mine && me.profile.role !== "admin" && !(me.profile.role === "staff" && sale.salesperson_id === me.user.id)) return jsonAuth(req, { error: "Not found." }, 404);
  const { data: reqs } = await db.from("service_requests").select("number, topic, message, status, booked_for, created_at").eq("customer_id", sale.customer_id).order("created_at", { ascending: false }).limit(20);
  return jsonAuth(req, { photos: await signedUrls(sale.delivery_photo_paths ?? []), requests: reqs ?? [] });
}

const TOPICS: Record<string, string> = { water: "Water care", heating: "Heating or temperature", jets: "Jets or pumps", leak: "A leak", controls: "Controls or error code", cover: "Cover or lifter", other: "Something else" };

// POST {sale_id, topic, message, photos?: [dataUrl]}  A customer asks for service. Shaun is emailed right away.
async function route_service_request(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsAuth(req) });
  const me = await caller(req);
  if (!me) return jsonAuth(req, { error: "Please sign in to your portal first." }, 401);
  const b = await req.json().catch(() => ({}));
  const message = String(b.message ?? "").trim().slice(0, 3000);
  if (message.length < 5) return jsonAuth(req, { error: "Tell us a little about what's going on." }, 400);
  const topic = TOPICS[String(b.topic)] ? String(b.topic) : "other";
  const db = admin();
  const { data: sale } = await db.from("sales").select("*, customers(*)").eq("id", String(b.sale_id ?? "")).maybeSingle();
  if (!sale || !(await customerSales(me)).ids.includes(sale.customer_id)) return jsonAuth(req, { error: "We couldn't find that hot tub on your account." }, 404);
  const photos = readPhotos(b.photos, 4);
  if (typeof photos === "string") return jsonAuth(req, { error: photos }, 400);
  const { data: row, error } = await db.from("service_requests").insert({ customer_id: sale.customer_id, sale_id: sale.id, created_by: me.user.id, topic, message }).select("id, number").single();
  if (error || !row) return jsonAuth(req, { error: "Couldn't send your request. Please call or text 236-304-4424." }, 500);
  const paths: string[] = [];
  for (let i = 0; i < photos.length; i++) {
    const path = `${sale.id}/service-${row.number}-${i + 1}.${photos[i].type === "image/png" ? "png" : "jpg"}`;
    const up = await db.storage.from("agreements").upload(path, photos[i].bytes, { contentType: photos[i].type, upsert: true });
    if (!up.error) paths.push(path);
  }
  if (paths.length) await db.from("service_requests").update({ photo_paths: paths }).eq("id", row.id);
  const c = sale.customers;
  const to = Deno.env.get("LEAD_TO") ?? "shaun@aquazen.ca";
  try {
    await sendEmail({
      from: FROM, to, reply_to: c.email || REPLY_TO, subject: `Service request #${row.number}: ${c.name} (${TOPICS[topic]})`,
      html: emailShell({ preheader: `${c.name} asked for service on their ${productWhat(sale)}.`, body:
        `<p><b>${escapeHtml(c.name)}</b> asked for service on their ${escapeHtml(productWhat(sale))}${sale.serial_number ? ` (serial ${escapeHtml(sale.serial_number)})` : ""}.</p>
<p><b>${escapeHtml(TOPICS[topic])}</b></p><p style="white-space:pre-wrap">${escapeHtml(message)}</p>
<p>${escapeHtml(c.cell ?? "")} &nbsp; ${escapeHtml(c.email ?? "")}<br>${escapeHtml([c.address, c.city_pc].filter(Boolean).join(", "))}</p>
${paths.length ? `<p>${paths.length} photo${paths.length > 1 ? "s" : ""} attached in the staff portal.</p>` : ""}
${button(`${SITE_URL}/staff/#service`, "Open in the staff portal")}` }),
    });
    await sendEmail({
      from: FROM, to: c.email, reply_to: REPLY_TO, subject: `We got your service request (#${row.number})`,
      html: emailShell({ preheader: "Thanks for letting us know. Here's what happens next.", body:
        `<p>Hi ${escapeHtml(firstNameOf(c.name))},</p><p>Thanks for letting us know. Your request is in, and I'll be in touch within one business day to sort it out.</p>
<p>The sooner we hear about something, the smaller it usually is, so you did exactly the right thing. Your serial number and delivery photos are already on file, so there's nothing else you need to find.</p>
<p style="color:${MUTED}">If it's urgent, like a leak or no heat in cold weather, call or text me at 236-304-4424.</p><p>Shaun</p>` }),
    });
  } catch (e) { console.error("service email", e); }
  return jsonAuth(req, { ok: true, number: row.number });
}

// POST {id?}  Staff: list service requests (admins all, salespeople their customers). With id: that request's photos.
async function route_service_list(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsAuth(req) });
  const me = await caller(req);
  if (!hasMenu(me, "service")) return jsonAuth(req, { error: "You don't have the Service menu." }, 403);
  const db = admin();
  const { data, error } = await db.from("service_requests").select("*, customers(name, cell, email, address, city_pc, created_by), sales(number, product_type, tub_model, serial_number, delivered_at)").order("created_at", { ascending: false }).limit(300);
  if (error) return jsonAuth(req, { error: "Couldn't load service requests." }, 500);
  // deno-lint-ignore no-explicit-any
  const rows = (data ?? []).filter((r: any) => me!.profile.role !== "staff" || r.customers?.created_by === me!.user.id);
  const out = [];
  for (const r of rows) out.push({ ...r, photos: await signedUrls(r.photo_paths ?? []) });
  return jsonAuth(req, { requests: out });
}

// POST {id, status?, staff_notes?, booked_for?}
async function route_service_update(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsAuth(req) });
  const me = await caller(req);
  if (!me || !hasMenu(me, "service")) return jsonAuth(req, { error: "You don't have the Service menu." }, 403);
  const b = await req.json().catch(() => ({}));
  const db = admin();
  const { data: r } = await db.from("service_requests").select("*, customers(created_by)").eq("id", String(b.id ?? "")).maybeSingle();
  if (!r || (me.profile.role === "staff" && r.customers?.created_by !== me.user.id)) return jsonAuth(req, { error: "Not found." }, 404);
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (["new", "booked", "done"].includes(b.status)) patch.status = b.status;
  if (b.staff_notes !== undefined) patch.staff_notes = String(b.staff_notes ?? "").slice(0, 3000) || null;
  if (b.booked_for !== undefined) patch.booked_for = /^\d{4}-\d{2}-\d{2}$/.test(String(b.booked_for)) ? String(b.booked_for) : null;
  const { error } = await db.from("service_requests").update(patch).eq("id", r.id);
  if (error) return jsonAuth(req, { error: "Couldn't save." }, 500);
  return jsonAuth(req, { ok: true });
}

// ---- Ad studio (admins): AI writes four hooks in Shaun's voice. Needs the ANTHROPIC_API_KEY secret. ----
const ADS_BRAND = `You write Facebook and Instagram ad copy for AquaZen, Shaun McAvoy's hot tub store at 7049 Russell Ave, Burnaby, BC.
- Sells AquaSolus hot tubs, swim spas and mini pools (always spell it AquaSolus). Visits by appointment. Own crew delivers from Whistler to Hope. Phone and text 236-304-4424. Website aquazen.ca.
- The why: a place of peace at home. Hot tub time is "Zen Time". Main call to action is "Find your Zen" (a short quiz on aquazen.ca that shows the two best hot tubs for you). Tagline: "Your Zen is calling."
- Every hot tub should deliver four things: luxury, healthy low-maintenance water, eco-friendly and energy efficient, and a massage that releases tension.
- Facts you may use: 56-frame pumps, not 48-frame. AQ10 insulation keeps 100% of the water insulated 100% of the time (full foam leaves the pumps, heater and lines bare). Double ozonator, so care is one teaspoon of chlorine after each soak. Shaun has over twenty years in the industry. Some stores cut corners and skip the best options, then make it up on chemicals and service calls; AquaZen sells the best options from day one.
- Voice: warm, plain, confident, like Shaun talking to a neighbour. Canadian spelling. Never use em dashes or en dashes. No hype words, no emojis, no hashtags.
- Never invent prices, discounts, statistics, reviews, awards or customer stories. Only mention an offer if the user gives one, worded exactly as given. Never mention other stores by name. Never write "Stop going. Start being."`;

// The SCP ad language. Drawn only from SCP Core (Act One, Core Skill 1: The Pattern Interrupt; Act Two: The Presentation)
// and Foundations of Professional Selling. Shaun picks factors and techniques in the Ad Brief; these are what the AI is told.
const ADS_SCP = `Write in the SCP ad language. Always:
- Inside out: emotion makes the decision, logic justifies it. Open with meaning, never a spec.
- The coffee shop test: plain human words you'd say to a friend, people not "the company", feeling words, Shaun's own opinion where it fits. No corporate words (premium, solutions, leverage, industry-leading, state-of-the-art).
- Clarity and certainty: short, clear, powerful. Statements, not hopeful questions. No hedge words (kind of, maybe, basically, I think).
- The emotional journey: meet the reader where they are. Never pressure, never hype, no exclamation marks.
- Positive emotional tension: an honest gap between wanting it and having it, so the call to action is the natural next step.
- Ethics (Foundations, the five rules of A-C-A and ethical persuasion): tell the truth. Never invent customers, stories, numbers, deadlines, stock levels or offers.`;

const ADS_FACTORS: Record<string, { n: string; d: string; fact?: string }> = {
  emotional: { n: "Emotional connection", d: "Help the reader vividly picture their life improved. When they can see it, they can feel it, and when they feel it, acting becomes natural." },
  loss: { n: "Fear of loss", fact: "the real limit", d: "Losses loom larger than gains. Show what waiting costs (the inaction cost) using only the real limit given. Use the transparency tone: 'I'd hate for you to miss it', never a fake buyer or fake scarcity." },
  urgency: { n: "Sense of urgency", fact: "the real timing", d: "Give a real reason to act now: time (the real deadline given), life (their own goal, like being in the water before the cold sets in) or momentum. Urgency is calm and helpful; pressure is selfish." },
  jones: { n: "Jones effect", fact: "the real pattern or customer", d: "Social proof. Nobody wants to be first; everyone wants to be next. Use only the real pattern or customer given, as the broad herd, a specific tribe or a local neighbour. 'My customers love this' beats 'I think'." },
  greed: { n: "Greed (value)", fact: "the real value", d: "People want to feel like savvy buyers. Widen the gap between what it should cost and what it does: set the anchor first, then the offer, or give a free bonus instead of a discount. Use only the real numbers given." },
  indifference: { n: "Indifference", d: "Calm, unattached confidence: 'If it's a fit, wonderful. If not, no hard feelings.' Be the prize, not the pest. People lean in when you lean back. Never needy." },
  reciprocity: { n: "Reciprocity", d: "Give a genuinely useful insight or tip for free, so value arrives before any ask." },
  authority: { n: "Authority", d: "Lead like the expert who has done this a thousand times: statements, a clear recommendation, a clear next step. Shaun has over twenty years in the industry." },
  consistency: { n: "Consistency", d: "Connect to something the reader already believes or wants, so acting is simply staying true to it." },
  suggestion: { n: "Power of suggestion", d: "Remove the burden of choice. Instead of listing options, suggest one clear path, the way a trusted expert would." },
};

const ADS_TECHNIQUES: Record<string, { n: string; d: string }> = {
  interrupt: { n: "Pattern interrupt", d: "People scroll on autopilot, armed with 'just looking'. Break the script with an opener that is unexpected, sincere and good to receive: gratitude, a genuine observation, honest humour, a question nobody else asks, or plain honesty about how AquaZen works. Never a gimmick or clickbait; a trick puts the guard back up higher. Say one true thing, then let it land. Set a warm temperature from the first line." },
  why: { n: "Inside-out WHY", d: "Connect AquaZen's purpose (a place of peace at home, a better evening, disconnecting on purpose) to the reader's reason for buying, before any product." },
  empathy: { n: "Empathy bridge", d: "Reflect the reader's real reason (what they want changed in their life, like their evenings back) and connect it, genuinely, to why AquaZen does this work." },
  story: { n: "Company story", d: "A founding problem beats a marketing fact. The industry scar AquaZen exists to heal: stores often cut corners and skip the best options, then make it up on chemicals and service calls. The belief, the commitment (the right equipment from day one), the result for the reader. Human and short." },
  howproof: { n: "HOW as proof", d: "Prove the WHY with a real decision: anchor (the belief), decision (what was done about it), distinction (why it's the harder, better way)." },
  shortcut: { n: "Standard versus shortcut", d: "Show the easy way often taken, then the way AquaZen and AquaSolus chose, and what it costs them to do it right. Never name or criticise anyone." },
  what: { n: "WHAT as proof", d: "One feature turned into proof, tied to the reader's life ('so you...'). The anchor proves the WHY; a shield answers an unspoken worry (upkeep, running cost, winter, what if something goes wrong)." },
  ownership: { n: "Ownership picture", d: "Help the reader picture it already theirs: a Friday night, a cold evening, the first soak after a long day." },
  reframe: { n: "Challenger reframe", d: "Hook with something counterintuitive, reframe a common belief (price tag versus cost of owning it, number of jets versus where they hit, summer versus winter), then connect it to the reader's life. Teach, never argue. Warmth first, then competence." },
  thirdvoice: { n: "Third voice", d: "Carry a truth through someone else's story so the reader doesn't have to defend against it. Use only a real story given, or the general pattern ('what tends to happen is...'). Never invent a customer." },
  identity: { n: "Identity", d: "People buy a better version of themselves. Reflect who the reader is becoming (someone who takes their evenings back, someone serious about recovery)." },
  connect: { n: "A-C-A Connect", d: "Name what the reader's interest says about them, truthfully: thoughtful, serious about their health, someone who does their homework. People live up to the labels they're given." },
};

const ADS_STAGES: Record<string, string> = {
  uncertainty: "Uncertainty: not shopping yet, maybe just curious. They need safety, warmth and permission to explore, with no pressure.",
  curiosity: "Curiosity: interested and asking questions. They need stimulation, new perspectives and genuine insight.",
  excitement: "Excitement: imagining it. They need validation and a vivid picture, without overhyping.",
  anxiety: "Close to deciding and second-guessing. They need calm reassurance, answers to their worries and permission to proceed.",
};

const ADS_PURPOSES: Record<string, string> = {
  visit: "Get people to book a visit to the Burnaby showroom (by appointment).",
  quiz: "Get people to take the Find your Zen quiz at aquazen.ca, which shows the two best hot tubs for them.",
  offer: "Promote the offer given, worded exactly as given.",
  trust: "Build trust in AquaZen, so people think of us first when they're ready.",
  other: "The purpose described in the idea.",
};

// deno-lint-ignore no-explicit-any
function adsBrief(b: any) {
  const clean = (s: unknown, n: number) => String(s ?? "").replace(/\s*[—–]\s*/g, ", ").trim().slice(0, n);
  const purpose = ADS_PURPOSES[b.purpose] ? b.purpose : "other";
  const factors = (Array.isArray(b.factors) ? b.factors : []).filter((k: string) => ADS_FACTORS[k]).slice(0, 4);
  const techniques = (Array.isArray(b.techniques) ? b.techniques : []).filter((k: string) => ADS_TECHNIQUES[k]).slice(0, 2);
  const facts: Record<string, string> = {};
  for (const k of factors) if (ADS_FACTORS[k].fact) facts[k] = clean(b.facts?.[k], 300);
  const missing = factors.filter((k: string) => ADS_FACTORS[k].fact && !facts[k]);
  const story = clean(b.story, 500);
  return {
    purpose, factors, techniques, facts, missing, story,
    mode: b.mode === "test" ? "test" : "same",
    idea: clean(b.idea, 600), offer: clean(b.offer, 300), audience: clean(b.audience, 200),
    stage: ADS_STAGES[b.stage] ? b.stage : "curiosity",
    imagery: ["photos", "ai", "mix"].includes(b.imagery) ? b.imagery : "photos",
    photos: Array.isArray(b.photos) ? b.photos.slice(0, 30).map((x: unknown) => clean(x, 40)) : [],
    layouts: Array.isArray(b.layouts) ? b.layouts.slice(0, 8).map((x: unknown) => clean(x, 60)) : [],
    look: b.look === "creative" ? "creative" : "on brand", style: clean(b.style, 20) || "modern",
  };
}

function adsBriefText(x: ReturnType<typeof adsBrief>): string {
  const lines = [
    `PURPOSE: ${ADS_PURPOSES[x.purpose]}`,
    x.idea ? `THE IDEA: ${x.idea}` : "",
    x.offer ? `OFFER (use exactly as written): ${x.offer}` : "NO OFFER. Don't mention one.",
    x.audience ? `WHO IT'S FOR: ${x.audience}` : "WHO IT'S FOR: homeowners in the Lower Mainland and Sea to Sky.",
    `WHERE THEY ARE ON THE EMOTIONAL JOURNEY: ${ADS_STAGES[x.stage]}`,
    x.factors.length
      ? `IMPULSE FACTORS (Foundations, Core Skill 5):\n${x.factors.map((k) => `- ${ADS_FACTORS[k].n}: ${ADS_FACTORS[k].d}${x.facts[k] ? ` THE REAL FACT TO USE: ${x.facts[k]}` : ""}`).join("\n")}`
      : "IMPULSE FACTORS: choose what fits, using only factors that need no outside facts (emotional connection, indifference, reciprocity, authority, consistency, power of suggestion).",
    x.techniques.length
      ? `SCP TECHNIQUES:\n${x.techniques.map((k) => `- ${ADS_TECHNIQUES[k].n}: ${ADS_TECHNIQUES[k].d}`).join("\n")}`
      : `SCP TECHNIQUES: choose what fits from: ${Object.values(ADS_TECHNIQUES).map((t) => t.n).join(", ")}.`,
    x.story ? `A REAL CUSTOMER STORY SHAUN GAVE (may be used): ${x.story}` : "",
    x.mode === "test"
      ? "THE FOUR ADS: a test. Keep the purpose and technique the same, and give each ad a different impulse factor so Facebook shows which one wins. Use the factors chosen; if fewer than four were chosen, fill the rest with factors that need no outside facts."
      : "THE FOUR ADS: the same recipe four ways. Every ad uses the chosen factors and techniques, each with a different execution (a different opener, angle and line).",
    `DESIGN: look is ${x.look}, style is ${x.style}.`,
    x.layouts.length ? `LAYOUTS (pick a key per ad): ${x.layouts.join("; ")}` : "",
    x.imagery === "photos" ? `IMAGES: use our photos only. Pick by number: ${x.photos.map((p, i) => `${i} ${p}`).join("; ")}`
      : x.imagery === "ai" ? "IMAGES: an AI-generated image for every ad. Write an image prompt for each."
      : `IMAGES: per ad, pick one of our photos by number (${x.photos.map((p, i) => `${i} ${p}`).join("; ")}) or write an AI image prompt, whichever fits the ad better.`,
    "AI IMAGE PROMPTS show settings, moments and feelings (steam rising on a snowy night, a robe on a hook, water close up, a quiet BC backyard at dusk, stars over cedar trees). Never a full hot tub product shot, because an invented tub would misrepresent what we sell; our own photos show the product. No people's faces, no text.",
  ];
  return lines.filter(Boolean).join("\n\n");
}

// deno-lint-ignore no-explicit-any
async function adsClaude(key: string, content: any[], maxTokens = 4000): Promise<any> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: Deno.env.get("ADS_MODEL") || "claude-sonnet-5-5", max_tokens: maxTokens, system: ADS_BRAND + "\n\n" + ADS_SCP, messages: [{ role: "user", content }] }),
  });
  if (!res.ok) { console.error("ads claude", res.status, await res.text().catch(() => "")); throw new Error("answer"); }
  const out = await res.json();
  // deno-lint-ignore no-explicit-any
  const text = (out.content ?? []).filter((c: any) => c.type === "text").map((c: any) => c.text).join("");
  try { return JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)); }
  catch { console.error("ads parse", out.stop_reason, text.slice(0, 1200)); throw new Error("parse"); }
}

// POST {action: "plan" | "write", brief, plan?, note?, image?}  Admins. Plans, then writes, four ads from Shaun's brief.
async function route_ads_write(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsAuth(req) });
  const me = await menuOnly(req, "ads");
  if (!me) return jsonAuth(req, { error: "You don't have the Ads menu." }, 403);
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) return jsonAuth(req, { error: "AI writing isn't switched on yet. Add an ANTHROPIC_API_KEY secret in Supabase." }, 400);
  const b = await req.json().catch(() => ({}));
  const x = adsBrief(b.brief ?? {});
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(b.image ?? ""));
  const copying = !!(m && m[2].length < 4_000_000);
  if (!x.idea && !copying && x.purpose === "other") return jsonAuth(req, { error: "Pick a purpose, add the idea, or add an ad you like." }, 400);
  if (x.missing.length) return jsonAuth(req, { error: `${x.missing.map((k: string) => ADS_FACTORS[k].n).join(" and ")} needs a real fact to be honest. Add it, or pick a different factor.` }, 400);
  const clean = (s: unknown, n: number) => String(s ?? "").replace(/\s*[—–]\s*/g, ", ").replace(/\s+/g, " ").trim().slice(0, n);
  const factorKeys = Object.keys(ADS_FACTORS), techKeys = Object.keys(ADS_TECHNIQUES);

  // deno-lint-ignore no-explicit-any
  const content: any[] = [];
  if (copying) {
    content.push({ type: "image", source: { type: "base64", media_type: m![1], data: m![2] } });
    content.push({ type: "text", text: "This is someone else's ad that Shaun likes. Use its structure, rhythm, length and feel, and pick the layout and photo of ours closest to its look. Write entirely fresh words about AquaZen. Never reuse its wording, slogans, brand names, claims, numbers or offers." });
  }
  content.push({ type: "text", text: adsBriefText(x) });

  try {
    if (b.action === "plan") {
      content.push({ type: "text", text: `Plan the four ads before writing them. Reply with only JSON:
{"angle":"one sentence: the core idea all four ads build on","reader":"one sentence: who they are and what they feel right now","ads":[{"factor":"one key from ${factorKeys.join(", ")}","technique":"one key from ${techKeys.join(", ")}","idea":"one sentence: how this ad works, in plain words","layout":"a layout key","photo":0,"imagePrompt":""}]}
For each ad set either photo (our photo number) or imagePrompt (an AI image prompt), not both.` });
      const j = await adsClaude(key, content, 2500);
      // deno-lint-ignore no-explicit-any
      const ads = (j.ads ?? []).slice(0, 4).map((a: any) => {
        const prompt = x.imagery !== "photos" ? clean(a.imagePrompt, 600) : "";
        return {
          factor: factorKeys.includes(a.factor) ? a.factor : x.factors[0] || "emotional",
          technique: techKeys.includes(a.technique) ? a.technique : x.techniques[0] || "why",
          idea: clean(a.idea, 300), layout: clean(a.layout, 20).split(":")[0],
          photo: prompt ? undefined : Math.max(0, Math.min(Math.max(x.photos.length - 1, 0), Number(a.photo) || 0)),
          imagePrompt: prompt || undefined,
        };
      });
      return jsonAuth(req, { plan: { angle: clean(j.angle, 300), reader: clean(j.reader, 300), ads } });
    }

    // Write: follow the approved plan, with Shaun's changes.
    const plan = b.plan && Array.isArray(b.plan.ads) ? b.plan : null;
    if (plan) content.push({ type: "text", text: `THE APPROVED PLAN (follow it):\n${JSON.stringify({ angle: plan.angle, reader: plan.reader, ads: plan.ads }).slice(0, 4000)}` });
    const note = clean(b.note, 600);
    if (note) content.push({ type: "text", text: `SHAUN'S CHANGES TO THE PLAN (these win): ${note}` });
    content.push({ type: "text", text: `Write the four ads. For each give:
- h: headline, at most 7 words
- s: supporting line, at most 14 words
- cta: button text, at most 3 words
- post: the post text above the ad, 2 or 3 short sentences ending with what to do next
- factor and technique: the keys it uses
- layout, and either photo (number) or imagePrompt, as planned
Reply with only JSON: {"hooks":[{"h":"","s":"","cta":"","post":"","factor":"","technique":"","layout":"","photo":0,"imagePrompt":""}]}` });
    const j = await adsClaude(key, content, 4000);
    // deno-lint-ignore no-explicit-any
    const hooks = (j.hooks ?? []).slice(0, 4).map((h: any) => {
      const f = factorKeys.includes(h.factor) ? h.factor : undefined, t = techKeys.includes(h.technique) ? h.technique : undefined;
      const prompt = x.imagery !== "photos" ? clean(h.imagePrompt, 600) : "";
      return {
        h: clean(h.h, 70), s: clean(h.s, 110), cta: clean(h.cta, 22) || "Find your Zen", post: clean(h.post, 600),
        factor: f, technique: t,
        principle: [f && ADS_FACTORS[f].n, t && ADS_TECHNIQUES[t].n].filter(Boolean).join(" + ") || undefined,
        layout: clean(h.layout, 20).split(":")[0] || undefined,
        photo: !prompt && Number.isInteger(Number(h.photo)) && Number(h.photo) >= 0 && Number(h.photo) < x.photos.length ? Number(h.photo) : undefined,
        imagePrompt: prompt || undefined,
      };
    }).filter((h: { h: string }) => h.h);
    if (!hooks.length) throw new Error("parse");
    return jsonAuth(req, { hooks });
  } catch (e) {
    return jsonAuth(req, { error: String((e as Error).message) === "answer" ? "The AI writer didn't answer. Please try again." : "The AI writer's answer didn't come through right. Please try again." }, 502);
  }
}

// POST {prompt}  Admins. An AI background image (OpenAI), returned as a data URL. Needs the OPENAI_API_KEY secret.
async function route_ads_image(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsAuth(req) });
  const me = await menuOnly(req, "ads");
  if (!me) return jsonAuth(req, { error: "You don't have the Ads menu." }, 403);
  const key = Deno.env.get("OPENAI_API_KEY");
  if (!key) return jsonAuth(req, { error: "AI images aren't switched on yet. Add an OPENAI_API_KEY secret in Supabase." }, 400);
  const b = await req.json().catch(() => ({}));
  const prompt = String(b.prompt ?? "").trim().slice(0, 900);
  if (!prompt) return jsonAuth(req, { error: "No image idea came through." }, 400);
  const full = `A photorealistic lifestyle photograph for a hot tub store's ad in British Columbia, Canada. ${prompt} Natural, warm, believable light. Calm empty space in the upper or lower third for a headline. Important: show no hot tub, spa, swim spa or pool of any kind, not even partly; only the setting, the steam, the light and the mood. No text, words, letters, logos, watermarks or people's faces.`;
  // OpenAI renames image models from time to time: try the preferred one, then their always-current alias.
  const models = [Deno.env.get("ADS_IMAGE_MODEL") || "gpt-image-2.5-sunburst", "chatgpt-image-latest"];
  let res: Response | null = null;
  // deno-lint-ignore no-explicit-any
  let out: any = {};
  for (const model of models) {
    res = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, prompt: full, size: "1024x1536", quality: "medium", n: 1, output_format: "jpeg", output_compression: 88 }),
    });
    out = await res.json().catch(() => ({}));
    if (res.ok || out?.error?.param !== "model") break;
    console.error("ads-image model", model, String(out?.error?.message ?? ""));
  }
  if (!res) return jsonAuth(req, { error: "The image didn't come through. Please try again." }, 502);
  if (!res.ok) {
    console.error("ads-image", res.status, JSON.stringify(out).slice(0, 800));
    const msg = String(out?.error?.message ?? "");
    if (/verif/i.test(msg)) return jsonAuth(req, { error: "OpenAI needs your organization verified before it will make images. In OpenAI, go to Settings, Organization, General and click Verify." }, 502);
    if (/billing|quota|credit/i.test(msg)) return jsonAuth(req, { error: "OpenAI says there's no credit on the account. Add some under Settings, Billing." }, 502);
    if (/safety|policy/i.test(msg)) return jsonAuth(req, { error: "OpenAI wouldn't make that image. Try a different idea." }, 502);
    return jsonAuth(req, { error: "The image didn't come through. Please try again." }, 502);
  }
  const b64 = out?.data?.[0]?.b64_json;
  if (!b64) return jsonAuth(req, { error: "The image didn't come through. Please try again." }, 502);
  return jsonAuth(req, { image: `data:image/jpeg;base64,${b64}` });
}

// ---- Send to Meta (admins). Needs the META_TOKEN secret: a Business Manager system user token with the Page,
// Instagram account and ad account assigned. Page, Instagram and ad account choices live in settings (meta_*). ----
const GRAPH = () => `https://graph.facebook.com/${Deno.env.get("META_GRAPH_VERSION") || "v23.0"}`;

// deno-lint-ignore no-explicit-any
async function graph(path: string, token: string, params: Record<string, unknown> = {}, method = "GET"): Promise<any> {
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null) body.set(k, typeof v === "string" ? v : JSON.stringify(v));
  body.set("access_token", token);
  const url = `${GRAPH()}/${path.replace(/^\//, "")}`;
  const res = method === "POST" ? await fetch(url, { method, body }) : await fetch(`${url}?${body}`, { method });
  const out = await res.json().catch(() => ({}));
  if (!res.ok || out.error) {
    const msg = out?.error?.error_user_msg || out?.error?.message || `Meta error ${res.status}`;
    console.error("meta", path, JSON.stringify(out).slice(0, 800));
    throw new Error(msg);
  }
  return out;
}

async function metaSettings() {
  const db = admin();
  const { data } = await db.from("settings").select("k, v").in("k", ["meta_page_id", "meta_ig_id", "meta_ad_account"]);
  const m: Record<string, string> = {};
  for (const r of data ?? []) m[r.k] = r.v;
  return { page: m.meta_page_id || "", ig: m.meta_ig_id || "", adAccount: m.meta_ad_account || "" };
}

// GET/POST {page_id?, ig_id?, ad_account?}  What's connected, and save which Page, Instagram and ad account to use.
async function route_meta_status(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsAuth(req) });
  const me = await menuOnly(req, "ads");
  if (!me) return jsonAuth(req, { error: "You don't have the Ads menu." }, 403);
  const token = Deno.env.get("META_TOKEN");
  if (!token) return jsonAuth(req, { configured: false });
  const b = req.method === "POST" ? await req.json().catch(() => ({})) : {};
  if (req.method === "POST" && me.profile.role !== "admin") return jsonAuth(req, { error: "Only an admin can change the connected Page or ad account." }, 403);
  const db = admin();
  for (const [k, f] of [["meta_page_id", "page_id"], ["meta_ig_id", "ig_id"], ["meta_ad_account", "ad_account"]]) {
    if (b[f] !== undefined) await db.from("settings").upsert({ k, v: String(b[f] ?? "").replace(/[^0-9a-z_]/gi, "").slice(0, 40) });
  }
  try {
    const pages = await graph("me/accounts", token, { fields: "id,name,instagram_business_account{id,username}", limit: 50 });
    const ads = await graph("me/adaccounts", token, { fields: "id,name,currency,account_status", limit: 50 });
    const s = await metaSettings();
    // deno-lint-ignore no-explicit-any
    const pageList = (pages.data ?? []).map((p: any) => ({ id: p.id, name: p.name, ig: p.instagram_business_account ? { id: p.instagram_business_account.id, username: p.instagram_business_account.username } : null }));
    // First time: pick the only Page / Instagram / ad account automatically.
    if (!s.page && pageList.length === 1) {
      s.page = pageList[0].id; await db.from("settings").upsert({ k: "meta_page_id", v: s.page });
      if (pageList[0].ig) { s.ig = pageList[0].ig.id; await db.from("settings").upsert({ k: "meta_ig_id", v: s.ig }); }
    }
    // deno-lint-ignore no-explicit-any
    const adList = (ads.data ?? []).map((a: any) => ({ id: a.id, name: a.name, currency: a.currency, active: a.account_status === 1 }));
    if (!s.adAccount && adList.length === 1) { s.adAccount = adList[0].id; await db.from("settings").upsert({ k: "meta_ad_account", v: s.adAccount }); }
    const savedAud = (await db.from("settings").select("v").eq("k", "meta_audience").maybeSingle()).data?.v;
    return jsonAuth(req, { configured: true, pages: pageList, adAccounts: adList, chosen: s, audience: savedAud ? JSON.parse(savedAud) : DEFAULT_AUDIENCE });
  } catch (e) {
    return jsonAuth(req, { configured: true, error: `Meta said: ${(e as Error).message}` }, 502);
  }
}


// ---- Ad results: what Meta says plus what really happened (leads tagged ?from=fbad, and sales) ----
const AD_RANGES: Record<string, string> = { today: "today", "7d": "last_7d", "30d": "last_30d", max: "maximum" };
// deno-lint-ignore no-explicit-any
const actionCount = (row: any, types: string[]) => (row?.actions ?? []).filter((a: any) => types.includes(a.action_type)).reduce((n: number, a: any) => n + Number(a.value || 0), 0);
const LEAD_TYPES = ["offsite_conversion.fb_pixel_lead", "lead"];
const LPV_TYPES = ["landing_page_view"];
function sinceFor(range: string) {
  const now = new Date(); const d = new Date(now.toLocaleString("en-US", { timeZone: "America/Vancouver" }));
  d.setHours(0, 0, 0, 0);
  if (range === "7d") d.setDate(d.getDate() - 6);
  else if (range === "30d") d.setDate(d.getDate() - 29);
  else if (range === "max") return new Date("2020-01-01T00:00:00Z");
  // back to UTC: Vancouver midnight
  return new Date(d.getTime() + (now.getTime() - new Date(now.toLocaleString("en-US", { timeZone: "America/Vancouver" })).getTime()));
}

// GET ?range=today|7d|30d|max
async function route_ads_stats(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsAuth(req) });
  const me = await menuOnly(req, "adresults");
  if (!me) return jsonAuth(req, { error: "You don't have the Ad results menu." }, 403);
  const token = Deno.env.get("META_TOKEN");
  const s = await metaSettings();
  if (!token || !s.adAccount) return jsonAuth(req, { configured: false });
  const act = s.adAccount.startsWith("act_") ? s.adAccount : `act_${s.adAccount}`;
  const range = AD_RANGES[new URL(req.url).searchParams.get("range") || "7d"] ? new URL(req.url).searchParams.get("range") || "7d" : "7d";
  const db = admin();
  try {
    const fields = "campaign_id,campaign_name,adset_id,ad_id,ad_name,spend,reach,impressions,frequency,inline_link_clicks,ctr,actions";
    const [camps, adIns, total, life] = await Promise.all([
      graph(`${act}/campaigns`, token, { fields: "id,name,status,effective_status,created_time,adsets.limit(20){id,name,status,effective_status,daily_budget},ads.limit(30){id,name,status,effective_status,adset_id,creative{body,title}}", limit: 50 }),
      graph(`${act}/insights`, token, { level: "ad", fields, date_preset: AD_RANGES[range], limit: 200 }),
      graph(`${act}/insights`, token, { fields: "spend,reach,impressions,inline_link_clicks,actions", date_preset: AD_RANGES[range] }),
      graph(`${act}/insights`, token, { fields: "spend", date_preset: "maximum" }),
    ]);
    const plat = await graph(`${act}/insights`, token, { fields: "spend,reach,impressions,inline_link_clicks,actions", breakdowns: "publisher_platform", date_preset: AD_RANGES[range] }).catch(() => ({ data: [] }));
    // deno-lint-ignore no-explicit-any
    const byAd: Record<string, any> = {};
    for (const r of adIns.data ?? []) byAd[r.ad_id] = r;
    // deno-lint-ignore no-explicit-any
    const num = (r: any, k: string) => Number(r?.[k] || 0);
    // deno-lint-ignore no-explicit-any
    const stat = (r: any) => ({ spend: num(r, "spend"), reach: num(r, "reach"), impressions: num(r, "impressions"), clicks: num(r, "inline_link_clicks"), visits: actionCount(r, LPV_TYPES), leads: actionCount(r, LEAD_TYPES), frequency: num(r, "frequency") });
    // deno-lint-ignore no-explicit-any
    const campaigns = (camps.data ?? []).map((c: any) => {
      // deno-lint-ignore no-explicit-any
      const ads = (c.ads?.data ?? []).map((a: any) => ({ id: a.id, name: a.name, status: a.status, effective: a.effective_status, adset: a.adset_id, headline: a.creative?.title || "", text: a.creative?.body || "", ...stat(byAd[a.id]) }));
      const sum = (k: string) => ads.reduce((n: number, a: Record<string, number>) => n + (a[k] || 0), 0);
      // deno-lint-ignore no-explicit-any
      const adsets = (c.adsets?.data ?? []).map((x: any) => ({ id: x.id, name: x.name, status: x.status, effective: x.effective_status, budget: x.daily_budget ? Number(x.daily_budget) / 100 : null }));
      return { id: c.id, name: c.name, status: c.status, effective: c.effective_status, created: c.created_time, adsets, ads,
        spend: sum("spend"), impressions: sum("impressions"), clicks: sum("clicks"), visits: sum("visits"), leads: sum("leads"),
        budget: adsets.reduce((n: number, x: { budget: number | null; status: string }) => n + (x.status === "ACTIVE" && x.budget ? x.budget : 0), 0) };
    });

    // What really happened: Find your Zen leads from ?from=fbad links, and who went on to buy.
    const since = sinceFor(range).toISOString();
    const { data: leads } = await db.from("leads").select("id, first_name, last_name, email, created_at, answers").gte("created_at", since).order("created_at", { ascending: false }).limit(500);
    // deno-lint-ignore no-explicit-any
    const adLeads = (leads ?? []).filter((l: any) => String(l.answers?.source ?? "").includes("fbad"));
    // deno-lint-ignore no-explicit-any
    const emails = [...new Set(adLeads.map((l: any) => String(l.email || "").toLowerCase()).filter(Boolean))];
    // deno-lint-ignore no-explicit-any
    let sold: any[] = [];
    if (emails.length) {
      const { data: custs } = await db.from("customers").select("id, email").in("email", emails);
      // deno-lint-ignore no-explicit-any
      const ids = (custs ?? []).map((c: any) => c.id);
      if (ids.length) {
        const { data: sales } = await db.from("sales").select("id, number, total, status, customer_id, customers(name, email)").in("customer_id", ids).not("status", "in", "(draft,cancelled)");
        sold = sales ?? [];
      }
    }
    // deno-lint-ignore no-explicit-any
    const soldEmails = new Set(sold.map((x: any) => String(x.customers?.email || "").toLowerCase()));

    // The ad fund: a set amount from every tub sold since the fund started, minus everything spent on ads since then.
    const { data: fs } = await db.from("settings").select("k, v").in("k", ["ad_fund_per_tub", "ad_fund_start", "ad_fund_added"]);
    const f: Record<string, string> = {}; for (const r of fs ?? []) f[r.k] = r.v;
    const perTub = Number(f.ad_fund_per_tub || 1500), start = f.ad_fund_start || "2026-11-27";
    const { count: tubs } = await db.from("sales").select("id", { count: "exact", head: true }).gte("customer_signed_at", start + "T00:00:00-08:00").not("status", "in", "(draft,cancelled)");
    const spentSince = Number((await graph(`${act}/insights`, token, { fields: "spend", time_range: { since: start, until: new Date().toISOString().slice(0, 10) } })).data?.[0]?.spend || 0);

    const t = total.data?.[0];
    const lastAdvice = (await db.from("settings").select("v").eq("k", "ads_advice_last").maybeSingle()).data?.v;
    return jsonAuth(req, {
      configured: true, range, account: act, advice: lastAdvice ? JSON.parse(lastAdvice) : null,
      totals: { ...stat(t), lifetime: Number(life.data?.[0]?.spend || 0) },
      // deno-lint-ignore no-explicit-any
      ours: { leads: adLeads.length, sales: sold.length, revenue: sold.reduce((n: number, x: any) => n + Number(x.total || 0), 0),
        // deno-lint-ignore no-explicit-any
        list: adLeads.slice(0, 50).map((l: any) => ({ name: [l.first_name, l.last_name].filter(Boolean).join(" "), when: l.created_at, bought: soldEmails.has(String(l.email || "").toLowerCase()), where: String(l.answers?.source ?? "") })) },
      fund: { perTub, start, tubs: tubs ?? 0, earned: (tubs ?? 0) * perTub, added: Number(f.ad_fund_added || 0), spent: spentSince,
        left: (tubs ?? 0) * perTub + Number(f.ad_fund_added || 0) - spentSince, canEdit: me.profile.role === "admin" },
      campaigns,
      // deno-lint-ignore no-explicit-any
      platforms: (plat.data ?? []).map((r: any) => ({ platform: r.publisher_platform, ...stat(r) })).filter((r: any) => r.impressions > 0),
      manager: `https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${act.replace("act_", "")}`,
    });
  } catch (e) {
    return jsonAuth(req, { configured: true, error: `Meta said: ${(e as Error).message}` }, 502);
  }
}

// POST {kind: 'campaign'|'adset'|'ad', id, action: 'pause'|'resume'} or {kind:'adset', id, budget}
//      or {fund: {per_tub, start}} (admins)
async function route_ads_control(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsAuth(req) });
  const me = await menuOnly(req, "adresults");
  if (!me) return jsonAuth(req, { error: "You don't have the Ad results menu." }, 403);
  const b = await req.json().catch(() => ({}));
  const db = admin();
  if (b.add_budget !== undefined) {
    if (me.profile.role !== "admin") return jsonAuth(req, { error: "Only an admin can add to the ad budget." }, 403);
    const amt = Math.round(Number(b.add_budget) * 100) / 100;
    if (!amt || Math.abs(amt) > 50000) return jsonAuth(req, { error: "Enter an amount, like 100." }, 400);
    const cur = Number((await db.from("settings").select("v").eq("k", "ad_fund_added").maybeSingle()).data?.v || 0);
    await db.from("settings").upsert({ k: "ad_fund_added", v: String(Math.round((cur + amt) * 100) / 100) });
    return jsonAuth(req, { ok: true, added: cur + amt });
  }
  if (b.fund) {
    if (me.profile.role !== "admin") return jsonAuth(req, { error: "Only an admin can change the ad fund." }, 403);
    const per = Math.max(0, Math.min(20000, Math.round(Number(b.fund.per_tub) || 0)));
    const start = /^\d{4}-\d{2}-\d{2}$/.test(String(b.fund.start)) ? String(b.fund.start) : "2026-11-27";
    await db.from("settings").upsert([{ k: "ad_fund_per_tub", v: String(per) }, { k: "ad_fund_start", v: start }]);
    return jsonAuth(req, { ok: true });
  }
  const token = Deno.env.get("META_TOKEN");
  const s = await metaSettings();
  if (!token || !s.adAccount) return jsonAuth(req, { error: "Meta isn't connected yet." }, 400);
  const act = s.adAccount.startsWith("act_") ? s.adAccount : `act_${s.adAccount}`;
  const id = String(b.id ?? "").replace(/\D/g, "");
  const kind = ["campaign", "adset", "ad"].includes(b.kind) ? b.kind : "";
  if (!id || !kind) return jsonAuth(req, { error: "Choose a campaign, ad set or ad." }, 400);
  try {
    // Only touch things that belong to our ad account.
    const obj = await graph(id, token, { fields: "account_id,name" });
    if (`act_${obj.account_id}` !== act) return jsonAuth(req, { error: "That isn't in the AquaZen ad account." }, 403);
    if (b.budget !== undefined) {
      if (kind !== "adset") return jsonAuth(req, { error: "Budgets are set on the ad set." }, 400);
      const dollars = Math.round(Number(b.budget));
      if (!(dollars >= 5 && dollars <= 500)) return jsonAuth(req, { error: "Choose a daily budget between $5 and $500." }, 400);
      await graph(id, token, { daily_budget: dollars * 100 }, "POST");
      await db.from("meta_sends").insert({ created_by: me.user.id, kind: "budget", headline: obj.name, result: { id, daily_budget: dollars } }).then(() => {}, () => {});
      return jsonAuth(req, { ok: true });
    }
    const status = b.action === "resume" ? "ACTIVE" : b.action === "pause" ? "PAUSED" : "";
    if (!status) return jsonAuth(req, { error: "Pause or resume?" }, 400);
    await graph(id, token, { status }, "POST");
    await db.from("meta_sends").insert({ created_by: me.user.id, kind: status === "ACTIVE" ? "resume" : "pause", headline: obj.name, result: { id, kind } }).then(() => {}, () => {});
    return jsonAuth(req, { ok: true });
  } catch (e) {
    return jsonAuth(req, { error: `Meta said: ${(e as Error).message}` }, 502);
  }
}


// ---- Ad advice: Claude reads the results and suggests changes; Shaun taps Apply on the ones he wants ----
// POST {data}  data = the ads-stats result the page is showing (re-checked on apply, never trusted for spending).
async function route_ads_advice(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsAuth(req) });
  const me = await menuOnly(req, "adresults");
  if (!me) return jsonAuth(req, { error: "You don't have the Ad results menu." }, 403);
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) return jsonAuth(req, { error: "AI advice isn't switched on yet. Add an ANTHROPIC_API_KEY secret in Supabase." }, 400);
  const b = await req.json().catch(() => ({}));
  const d = b.data ?? {};
  // deno-lint-ignore no-explicit-any
  const camps = (d.campaigns ?? []).filter((c: any) => !["ARCHIVED", "DELETED"].includes(c.effective)).slice(0, 12).map((c: any) => ({
    campaign: c.name, campaign_id: c.id, status: c.effective,
    // deno-lint-ignore no-explicit-any
    adsets: (c.adsets ?? []).map((x: any) => ({ adset_id: x.id, name: x.name, status: x.effective, daily_budget: x.budget })),
    // deno-lint-ignore no-explicit-any
    ads: (c.ads ?? []).slice(0, 10).map((a: any) => ({ ad_id: a.id, status: a.effective, headline: String(a.headline || "").slice(0, 200), text: String(a.text || "").slice(0, 900), spend: a.spend, impressions: a.impressions, reach: a.reach, clicks: a.clicks, leads_meta: a.leads, frequency: a.frequency })),
  }));
  const facts = { period: d.range, totals: d.totals, our_leads_from_ads: d.ours?.leads, our_sales_from_ads: d.ours?.sales, ad_fund_left: d.fund?.left, platforms: d.platforms, campaigns: camps };
  const prompt = `You are AquaZen's ad coach. Shaun owns AquaZen, a new hot tub company in Burnaby. He is not a marketer. Read these Facebook and Instagram ad results and tell him, in plain everyday words, how his ads are doing and what to change.

RESULTS (JSON):
${JSON.stringify(facts).slice(0, 14000)}

RULES
- Be honest. If there is too little data to judge (under about 1,000 views or under $10 spent on something), say so and don't recommend changes to it.
- Only recommend changes you can tie to the numbers above. Never invent numbers.
- Budgets: daily budgets between $5 and $500. Never recommend more total daily spend than the ad fund can cover for the next 7 days (ad_fund_left / 7), unless the fund is under $0, in which case keep total spend where it is or lower.
- Only use ids that appear in the results. Budgets change on ad sets (adset_id). Pause or resume campaigns (campaign_id) or ads (ad_id).
- A "copy" change writes new wording for one ad, keeping its picture. Write it in Shaun's voice, following the brand and SCP ad language rules you were given. A headline is under 40 characters. Main text is under 400 characters. No em dashes. Only suggest copy for an ad that has had a fair chance (over about 2,000 views) and gets few clicks, or that people have seen too often (frequency over 3.5).
- At most 5 recommendations, most important first. Fewer is fine. If nothing should change, say so and return no recommendations.
- Explain every "why" in one or two short sentences a non-marketer understands, using the numbers.

Answer with JSON only:
{"grade":"great|good|okay|poor|too_early","headline":"one short sentence: how the ads are doing overall","summary":"two or three plain sentences","recommendations":[{"type":"budget|pause|resume|copy","target_id":"id","target_name":"name","why":"plain reason","new_budget":0,"new_headline":"","new_text":""}]}`;
  try {
    const out = await adsClaude(key, [{ type: "text", text: prompt }], 3000);
    // deno-lint-ignore no-explicit-any
    const recs = (Array.isArray(out.recommendations) ? out.recommendations : []).slice(0, 5).filter((r: any) => ["budget", "pause", "resume", "copy"].includes(r.type) && /^\d+$/.test(String(r.target_id)))
      // deno-lint-ignore no-explicit-any
      .map((r: any) => ({ ...r, new_headline: String(r.new_headline || "").replace(/\s*[\u2014\u2013]\s*/g, ", ").slice(0, 80), new_text: String(r.new_text || "").replace(/\s*[\u2014\u2013]\s*/g, ", ").slice(0, 600), why: String(r.why || "").replace(/\s*[\u2014\u2013]\s*/g, ", ") }));
    const advice = { grade: String(out.grade || "too_early"), headline: String(out.headline || ""), summary: String(out.summary || ""), recommendations: recs, at: new Date().toISOString(), range: d.range };
    await admin().from("settings").upsert({ k: "ads_advice_last", v: JSON.stringify(advice) });
    return jsonAuth(req, advice);
  } catch {
    return jsonAuth(req, { error: "The advice didn't come through. Please try again." }, 502);
  }
}

// POST {rec}  Apply one recommendation. Budgets and pauses go through the same checks as ads-control.
// Copy: a new ad in the same ad set with the new wording and the same picture or video; the old ad is paused.
async function route_ads_apply(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsAuth(req) });
  const me = await menuOnly(req, "adresults");
  if (!me) return jsonAuth(req, { error: "You don't have the Ad results menu." }, 403);
  const token = Deno.env.get("META_TOKEN");
  const s = await metaSettings();
  if (!token || !s.adAccount) return jsonAuth(req, { error: "Meta isn't connected yet." }, 400);
  const act = s.adAccount.startsWith("act_") ? s.adAccount : `act_${s.adAccount}`;
  const r = (await req.json().catch(() => ({}))).rec ?? {};
  const id = String(r.target_id ?? "").replace(/\D/g, "");
  if (!id) return jsonAuth(req, { error: "Nothing to change." }, 400);
  const db = admin();
  try {
    const obj = await graph(id, token, { fields: "account_id,name" });
    if (`act_${obj.account_id}` !== act) return jsonAuth(req, { error: "That isn't in the AquaZen ad account." }, 403);
    if (r.type === "budget") {
      const dollars = Math.round(Number(r.new_budget));
      if (!(dollars >= 5 && dollars <= 500)) return jsonAuth(req, { error: "Choose a daily budget between $5 and $500." }, 400);
      await graph(id, token, { daily_budget: dollars * 100 }, "POST");
      await db.from("meta_sends").insert({ created_by: me.user.id, kind: "budget", headline: obj.name, result: { id, daily_budget: dollars, from: "advice" } }).then(() => {}, () => {});
      return jsonAuth(req, { ok: true, done: `Budget for ${obj.name} is now $${dollars} a day.` });
    }
    if (r.type === "pause" || r.type === "resume") {
      const status = r.type === "resume" ? "ACTIVE" : "PAUSED";
      await graph(id, token, { status }, "POST");
      await db.from("meta_sends").insert({ created_by: me.user.id, kind: r.type, headline: obj.name, result: { id, from: "advice" } }).then(() => {}, () => {});
      return jsonAuth(req, { ok: true, done: `${obj.name} is ${status === "ACTIVE" ? "turned on" : "paused"}.` });
    }
    if (r.type === "copy") {
      const headline = String(r.new_headline || "").replace(/\s*[\u2014\u2013]\s*/g, ", ").trim().slice(0, 80);
      const message = String(r.new_text || "").replace(/\s*[\u2014\u2013]\s*/g, ", ").trim().slice(0, 600);
      if (!headline || !message) return jsonAuth(req, { error: "The new wording is missing." }, 400);
      const ad = await graph(id, token, { fields: "name,status,adset_id,creative{object_story_spec}" });
      const old = ad.creative?.object_story_spec ?? {};
      // deno-lint-ignore no-explicit-any
      const story: any = { page_id: old.page_id };
      if (old.instagram_user_id) story.instagram_user_id = old.instagram_user_id;
      if (old.instagram_actor_id) story.instagram_actor_id = old.instagram_actor_id;
      if (old.video_data) {
        const v = old.video_data;
        story.video_data = { video_id: v.video_id, message, title: headline, call_to_action: v.call_to_action };
        if (v.image_hash) story.video_data.image_hash = v.image_hash; else if (v.image_url) story.video_data.image_url = v.image_url;
      } else if (old.link_data) {
        const l = old.link_data;
        story.link_data = { link: l.link, message, name: headline, call_to_action: l.call_to_action };
        if (l.image_hash) story.link_data.image_hash = l.image_hash; else if (l.picture) story.link_data.picture = l.picture;
      } else return jsonAuth(req, { error: "This ad's format can't be copied here. Change it in Ads Manager." }, 400);
      const cr = await graph(`${act}/adcreatives`, token, { name: `AquaZen: ${headline}`, object_story_spec: story }, "POST");
      const day = new Date().toISOString().slice(0, 10);
      const nu = await graph(`${act}/ads`, token, { name: `${headline} (${day})`, adset_id: ad.adset_id, creative: { creative_id: cr.id }, status: ad.status === "ACTIVE" ? "ACTIVE" : "PAUSED" }, "POST");
      if (ad.status === "ACTIVE") await graph(id, token, { status: "PAUSED" }, "POST");
      await db.from("meta_sends").insert({ created_by: me.user.id, kind: "copy", headline, result: { old_ad: id, new_ad: nu.id, from: "advice" } }).then(() => {}, () => {});
      return jsonAuth(req, { ok: true, done: ad.status === "ACTIVE" ? `New wording is running. The old ad is paused. Meta may take a little while to review it.` : `New ad made with the new wording. It's paused, like the old one, until you turn it on.` });
    }
    return jsonAuth(req, { error: "Unknown change." }, 400);
  } catch (e) {
    return jsonAuth(req, { error: `Meta said: ${(e as Error).message}` }, 502);
  }
}


// ---- Ad audience and buttons (Ad studio) ----
// Buttons Meta allows: website ads (traffic) and Messenger ads (click to message).
const WEB_CTAS = ["LEARN_MORE", "SHOP_NOW", "BOOK_TRAVEL", "GET_QUOTE", "CONTACT_US", "SIGN_UP", "GET_OFFER", "APPLY_NOW", "SUBSCRIBE"];
const MSG_CTAS = ["MESSAGE_PAGE", "LEARN_MORE", "SHOP_NOW"];
const SHOWROOM = { latitude: 49.2245, longitude: -122.9932 };
const DEFAULT_AUDIENCE = { age_min: 30, age_max: 65, showroom_km: 60, cities: [] as { key: string; name: string; radius: number }[] };
// deno-lint-ignore no-explicit-any
function cleanAudience(a: any) {
  const x = a && typeof a === "object" ? a : DEFAULT_AUDIENCE;
  const age_min = Math.max(18, Math.min(65, Math.round(Number(x.age_min) || 30)));
  const age_max = Math.max(age_min, Math.min(65, Math.round(Number(x.age_max) || 65)));
  const showroom_km = Math.max(0, Math.min(80, Math.round(Number(x.showroom_km) || 0)));
  // deno-lint-ignore no-explicit-any
  const cities = (Array.isArray(x.cities) ? x.cities : []).slice(0, 25).map((c: any) => ({ key: String(c.key ?? "").replace(/\D/g, ""), name: String(c.name ?? "").slice(0, 80), radius: Math.max(17, Math.min(80, Math.round(Number(c.radius) || 25))) })).filter((c: { key: string }) => c.key);
  if (!showroom_km && !cities.length) return "Choose at least one place: the area around the showroom or a city.";
  const geo: Record<string, unknown> = {};
  if (showroom_km) geo.custom_locations = [{ ...SHOWROOM, radius: Math.max(1, showroom_km), distance_unit: "kilometer" }];
  if (cities.length) geo.cities = cities.map((c: { key: string; radius: number }) => ({ key: c.key, radius: c.radius, distance_unit: "kilometer" }));
  const where = [showroom_km ? `${showroom_km} km around Burnaby` : "", ...cities.map((c: { name: string }) => c.name)].filter(Boolean).join(", ");
  return {
    targeting: { geo_locations: geo, age_min, age_max, targeting_automation: { advantage_audience: 0 } },
    label: `${where.slice(0, 120)}, ${age_min} to ${age_max === 65 ? "65+" : age_max}`,
    saved: { age_min, age_max, showroom_km, cities },
  };
}

// GET ?q=  Find Canadian cities for the ad audience.
async function route_meta_geo(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsAuth(req) });
  const me = await menuOnly(req, "ads");
  if (!me) return jsonAuth(req, { error: "You don't have the Ads menu." }, 403);
  const token = Deno.env.get("META_TOKEN");
  const q = (new URL(req.url).searchParams.get("q") || "").trim().slice(0, 60);
  if (!token || q.length < 2) return jsonAuth(req, { places: [] });
  try {
    const r = await graph("search", token, { type: "adgeolocation", q, location_types: ["city"], country_code: "CA", limit: 8 });
    // deno-lint-ignore no-explicit-any
    return jsonAuth(req, { places: (r.data ?? []).map((p: any) => ({ key: String(p.key), name: [p.name, p.region].filter(Boolean).join(", ") })) });
  } catch (e) {
    return jsonAuth(req, { error: `Meta said: ${(e as Error).message}` }, 502);
  }
}

async function signedAdUrl(path: string): Promise<string> {
  const { data, error } = await admin().storage.from("ads").createSignedUrl(path, 3600);
  if (error || !data?.signedUrl) throw new Error("Couldn't prepare the file for Meta.");
  return data.signedUrl;
}
const okPath = (p: unknown) => typeof p === "string" && /^[0-9a-f-]{36}\/[\w.-]+\.(png|jpg|mp4|webm)$/i.test(p) ? p : "";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// POST {image, video?, caption, facebook, instagram}  Publish an approved ad as a post on the Page and/or Instagram.
async function route_meta_post(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsAuth(req) });
  const me = await menuOnly(req, "ads");
  if (!me) return jsonAuth(req, { error: "You don't have the Ads menu." }, 403);
  const token = Deno.env.get("META_TOKEN");
  if (!token) return jsonAuth(req, { error: "Meta isn't connected yet." }, 400);
  const b = await req.json().catch(() => ({}));
  const image = okPath(b.image), video = okPath(b.video);
  const caption = String(b.caption ?? "").replace(/\s*[—–]\s*/g, ", ").slice(0, 2000);
  if (!image && !video) return jsonAuth(req, { error: "No ad came through." }, 400);
  const s = await metaSettings();
  const done: Record<string, string> = {}, failed: Record<string, string> = {};
  const mediaUrl = await signedAdUrl(video || image);

  if (b.facebook) {
    try {
      if (!s.page) throw new Error("Pick your Facebook Page first.");
      const pg = await graph(s.page, token, { fields: "access_token" });
      const r = video
        ? await graph(`${s.page}/videos`, pg.access_token, { file_url: mediaUrl, description: caption }, "POST")
        : await graph(`${s.page}/photos`, pg.access_token, { url: mediaUrl, caption }, "POST");
      done.facebook = r.post_id || r.id;
    } catch (e) { failed.facebook = (e as Error).message; }
  }
  if (b.instagram) {
    try {
      if (!s.ig) throw new Error("Your Facebook Page doesn't have an Instagram business account linked.");
      const c = await graph(`${s.ig}/media`, token, video ? { media_type: "REELS", video_url: mediaUrl, caption } : { image_url: mediaUrl, caption }, "POST");
      // Instagram needs a moment to prepare pictures as well as videos before they can be published.
      for (let i = 0; i < (video ? 30 : 15); i++) {
        const st = await graph(c.id, token, { fields: "status_code" }).catch(() => ({}));
        if (st.status_code === "FINISHED") break;
        if (st.status_code === "ERROR") throw new Error(`Instagram couldn't process the ${video ? "video" : "picture"}.`);
        await sleep(i < 3 ? 2000 : 3000);
      }
      // If it still says "not ready", give it a few more tries.
      let p;
      for (let i = 0; ; i++) {
        try { p = await graph(`${s.ig}/media_publish`, token, { creation_id: c.id }, "POST"); break; }
        catch (e) { if (i >= 4 || !/not ready/i.test((e as Error).message)) throw e; await sleep(4000); }
      }
      done.instagram = p.id;
    } catch (e) { failed.instagram = (e as Error).message; }
  }
  await admin().from("meta_sends").insert({ created_by: me.user.id, kind: "post", headline: String(b.headline ?? "").slice(0, 120), media_path: video || image, result: { done, failed } });
  return jsonAuth(req, { done, failed });
}

// POST {image, video?, headline, caption, link, budget}  Create a complete ad in the ad account, PAUSED. Nothing spends until Shaun turns it on.
async function route_meta_ad(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsAuth(req) });
  const me = await menuOnly(req, "ads");
  if (!me) return jsonAuth(req, { error: "You don't have the Ads menu." }, 403);
  const token = Deno.env.get("META_TOKEN");
  if (!token) return jsonAuth(req, { error: "Meta isn't connected yet." }, 400);
  const b = await req.json().catch(() => ({}));
  const image = okPath(b.image), video = okPath(b.video);
  if (!image) return jsonAuth(req, { error: "No ad came through." }, 400);
  const s = await metaSettings();
  if (!s.adAccount || !s.page) return jsonAuth(req, { error: "Pick your Facebook Page and ad account first." }, 400);
  const headline = String(b.headline ?? "").replace(/\s*[—–]\s*/g, ", ").slice(0, 120);
  const message = String(b.caption ?? "").replace(/\s*[—–]\s*/g, ", ").slice(0, 2000);
  // ?from=fbad tags Find your Zen leads as "from a Facebook ad" so Ad results can count them.
  const links: Record<string, string> = { zen: "https://aquazen.ca/how-we-deliver-zen/?from=fbad", visit: "https://aquazen.ca/visit/?from=fbad", quiz: "https://aquazen.ca/find-your-zen/?from=fbad" };
  // "messages" opens a Messenger chat with the Page, where Noah answers. Everything else goes to a page on aquazen.ca.
  const toMessages = String(b.link) === "messages";
  const link = toMessages ? "https://fb.com/messenger_doc/" : links[String(b.link)] || "https://aquazen.ca/?from=fbad";
  const ctaType = (toMessages ? MSG_CTAS : WEB_CTAS).includes(String(b.cta)) ? String(b.cta) : toMessages ? "MESSAGE_PAGE" : "LEARN_MORE";
  const aud = cleanAudience(b.audience);
  if (typeof aud === "string") return jsonAuth(req, { error: aud }, 400);
  const budget = Math.max(5, Math.min(500, Math.round(Number(b.budget) || 20))); // dollars a day
  const act = s.adAccount.startsWith("act_") ? s.adAccount : `act_${s.adAccount}`;
  const day = new Date().toISOString().slice(0, 10);
  const steps: Record<string, string> = {};
  try {
    // The image (also the video's cover).
    const bytes = new Uint8Array(await (await admin().storage.from("ads").download(image)).data!.arrayBuffer());
    let bin = ""; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    const up = await graph(`${act}/adimages`, token, { bytes: btoa(bin) }, "POST");
    // deno-lint-ignore no-explicit-any
    const hash = (Object.values(up.images ?? {})[0] as any)?.hash;
    if (!hash) throw new Error("Meta didn't accept the image.");
    let videoId = "";
    if (video) videoId = (await graph(`${act}/advideos`, token, { file_url: await signedAdUrl(video), name: headline }, "POST")).id;

    const camp = await graph(`${act}/campaigns`, token, {
      name: `AquaZen: ${headline}${toMessages ? " (Messenger)" : ""} (${day})`, objective: toMessages ? "OUTCOME_ENGAGEMENT" : "OUTCOME_TRAFFIC", status: "PAUSED",
      special_ad_categories: [], is_adset_budget_sharing_enabled: false,
    }, "POST");
    steps.campaign = camp.id;
    const setBase = {
      name: `${aud.label} (${day})`, campaign_id: camp.id, status: "PAUSED",
      daily_budget: budget * 100, billing_event: "IMPRESSIONS", bid_strategy: "LOWEST_COST_WITHOUT_CAP", targeting: aud.targeting,
    };
    let set;
    if (toMessages) {
      // Click to Messenger: the chat opens with our Page, and Noah answers.
      set = await graph(`${act}/adsets`, token, { ...setBase, destination_type: "MESSENGER", optimization_goal: "CONVERSATIONS", promoted_object: { page_id: s.page } }, "POST");
    } else {
      // Aim for people who actually load the page (the pixel sees it), not just taps. Fall back to taps if Meta won't allow it.
      try { set = await graph(`${act}/adsets`, token, { ...setBase, destination_type: "WEBSITE", optimization_goal: "LANDING_PAGE_VIEWS" }, "POST"); }
      catch { set = await graph(`${act}/adsets`, token, { ...setBase, optimization_goal: "LINK_CLICKS" }, "POST"); }
    }
    steps.adset = set.id;
    await admin().from("settings").upsert({ k: "meta_audience", v: JSON.stringify(aud.saved) });
    const cta = toMessages ? { type: ctaType, value: { app_destination: "MESSENGER" } } : { type: ctaType, value: { link } };
    const story: Record<string, unknown> = { page_id: s.page };
    if (s.ig) story.instagram_user_id = s.ig;
    if (videoId) story.video_data = { video_id: videoId, image_hash: hash, message, title: headline, call_to_action: cta };
    else story.link_data = { image_hash: hash, link, message, name: headline, call_to_action: cta };
    const cr = await graph(`${act}/adcreatives`, token, { name: `AquaZen: ${headline}`, object_story_spec: story }, "POST");
    steps.creative = cr.id;
    const ad = await graph(`${act}/ads`, token, { name: `AquaZen: ${headline}`, adset_id: set.id, creative: { creative_id: cr.id }, status: "PAUSED" }, "POST");
    steps.ad = ad.id;
    // "Start ad campaign": everything is built paused first, then switched on together, so a failed step never leaves
    // a half-built ad spending. If switching on fails, it stays paused and the page says so.
    let started = false, startError = "";
    if (b.start === true) {
      try {
        for (const id of [ad.id, set.id, camp.id]) await graph(id, token, { status: "ACTIVE" }, "POST");
        started = true;
      } catch (e) { startError = (e as Error).message; }
    }
    await admin().from("meta_sends").insert({ created_by: me.user.id, kind: started ? "ad_started" : "ad", headline, media_path: video || image, result: { ...steps, started, startError } });
    return jsonAuth(req, { ok: true, started, startError, ...steps, manager: `https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${act.replace("act_", "")}&selected_campaign_ids=${camp.id}` });
  } catch (e) {
    // Don't leave a half-built, empty campaign behind: deleting the campaign removes its ad set too.
    if (steps.campaign) { try { await graph(steps.campaign, token, {}, "DELETE"); steps.removed = "campaign"; } catch { /* leave it; it's paused */ } }
    await admin().from("meta_sends").insert({ created_by: me.user.id, kind: "ad", headline, media_path: video || image, result: { steps, error: (e as Error).message } });
    const m = (e as Error).message;
    const nice = /payment method/i.test(m) ? "Your ad account needs a payment method first. Add one in Meta's Billing and payments, then try again." : `Meta said: ${m}`;
    return jsonAuth(req, { error: nice, steps }, 502);
  }
}

// ---- Noah: AquaZen's social media salesperson on Messenger and Instagram DMs ----
// Meta sends each message to meta-webhook. Noah answers with the SCP conversation method, aims for the
// Find your Zen quiz (or a phone call with the team), hands buyers to a person, and sends one pattern-interrupt
// follow-up inside Meta's 24-hour window. Secrets: META_TOKEN, META_APP_SECRET, ANTHROPIC_API_KEY.
declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;
const QUIZ_URL = "https://aquazen.ca/find-your-zen/";

const HOW_URL = "https://aquazen.ca/how-we-deliver-zen/?from=noah";
const NOAH_METHOD = `You are Noah, on AquaZen's social media sales team, chatting in Facebook Messenger and Instagram DMs.

WHO YOU ARE
- You are an AI. You don't need to announce it, but you never claim or imply to be a human, and if someone sincerely asks whether they're talking to a real person or a bot, tell the truth plainly ("I'm Noah, AquaZen's AI on social media") and offer to have Shaun or the team call them. Never make up personal experiences (no "I sat in one last week", no family, no body).
- You speak the way Shaun would: warm, plain, confident, Canadian spelling, never pushy. Short messages like a real DM: usually 1 to 3 sentences, at most one question. No emojis unless they use them first. Never use em dashes or en dashes.

YOUR JOB: SELL THE PRESENTATION
Online, people don't want a long getting-to-know-you chat, and the Find your Zen form already asks the intake questions. So you don't interview anyone. Your one job, your close, is getting them to go through the presentation: How we deliver Zen (${HOW_URL}). It shows why AquaZen exists and how an AquaSolus hot tub delivers it in four chapters: efficiency (it starts with the pumps), the massage, clean and easy water, and heat control. A person who goes through it understands why AquaZen is different better than any chat could explain.
- When you send the link, let them know the Find your Zen form is at the end and that they should fill it out: it shows the two hot tubs that fit them best, with why, and the team calls to book a quiet visit. Mention it as part of the presentation; don't send it as a separate step or a separate link.
- If they come back after the presentation, warmly encourage them to fill out the Find your Zen form at the end, if they haven't yet.
- Only if they clearly won't do the presentation and want a recommendation now, send the Find your Zen form on its own (${QUIZ_URL}). If they don't want either, offer a phone call with someone on the team: get their first name, phone number and a good time.
- If they're ready to buy, get their name, phone number and email, and tell them someone on the team will call to confirm inventory and write up the invoice. You never take payment, promise stock or confirm delivery dates yourself.

HOW THE CONVERSATION GOES (SCP, Act One, built for DMs)
1. Pattern interrupt, in your first message. People message on autopilot, ready for "How can I help you?" and armed with "just looking". Break that with something unexpected, sincere and good to receive: a real observation about what they wrote, honest warmth, plain honesty about how AquaZen works, or light humour. If they asked a simple question, answer it in a few words inside the interrupt (never dodge a question). Never a gimmick, never "How can I help you?".
2. Introduce the opportunity with a true hook that opens a curiosity gap. Let them know their timing is good, or that there's something most hot tub buyers never get told, and pause on it so they want to know why ("Your timing is good, and not just because of the sale. Want to know why?"). The hook must be true. True reasons: the current promotion below; the season (winter is the best time to own one); and AquaZen itself, below.
3. The payload: AquaZen's why, said like a person who cares, not a company statement. AquaZen is a new company in the Vancouver area, started by Shaun to change the way hot tub stores treat their customers. A lot of stores cut corners or don't go with the best options, then make it up later on chemicals and service calls, and the owner ends up fussing with the water instead of enjoying it. AquaZen puts the best options in from day one, because a hot tub is supposed to give you a place of peace at home, not another chore. "Zen Time" is the time you spend in the tub, on purpose, instead of letting the evening disappear. Share it like an insider letting a friend in on something. Never name or criticise another store; say "a lot of stores" or "the usual way".
4. Sell the presentation. It's on the website; never say you made it or put it together. It opens with a short welcome and a Start button, and Find your Zen is built into the end of it. This is the close, so make them want it: one specific, true teaser that opens a curiosity gap only the presentation closes, why it's worth their few minutes (they'll know more than most buyers ever do, and they'll know exactly what to look for in any hot tub), the link, the Find your Zen form at the end, then take the pressure off ("Have a look when you've got a few minutes. No rush."). Teasers you can use (all true and shown on the page): why most hot tub jets feel like an itch instead of a massage; why a typical hot tub takes about 45 minutes to clean all its water and an AquaSolus does it in under 10; why most insulation leaves the pumps and lines bare, so the tub keeps running in the cold; how care comes down to one teaspoon of chlorine after a soak. Pick the one that fits what they said.
5. If they hesitate or ask more questions instead, answer briefly, then bring it back to the presentation with a new reason that fits what they asked ("That's exactly what the second part shows").
Keep it moving: by your second or third message they should have the presentation link. Don't repeat a link you've already sent unless they ask for it; point to it instead ("the link above").

FOUNDATIONS OF PROFESSIONAL SELLING (use them, briefly)
- A-C-A on a question, worry or objection: Acknowledge it in your own words, Connect it to something true and positive, then answer or ask one question about their question. Keep it to a sentence or two in DMs.
- Emotion first, logic second. Certainty transfers: statements, not hedges (no "kind of", "maybe", "I think").
- The Challenger: respectfully reframe a belief that would lead to a worse decision (price tag versus the cost of owning it, number of jets versus how much water reaches them, waiting for summer versus winter being the best season). Warmth first, then the challenge.
- Authority and the power of suggestion: one clear next step, never a menu of options.
- Push and people pull away; pull back and they lean in. Hand the choice back to them.
- Impulse factors, ethically only: real urgency only from the real promotion below, value from the real savings below, the Jones effect only as a true general pattern, reciprocity through a genuinely useful tip. Never invent a deadline, a customer or a story.
- The five rules: keep the human first, stay in the conversation not the argument, never disagree with the person (only with an idea), stay genuinely curious, tell the truth.
Facts you can use when they ask about the hot tubs: 56-frame pumps, not 48-frame; wide plumbing that delivers four to five times more water to every jet; a double ozonator with a 45-second mixing chamber, then UV, so care is one teaspoon of chlorine after each soak; AQ10 insulation keeps 100% of the water insulated 100% of the time, sealed on all six sides; AquaSolus hot tubs are built by hand. Tie any feature to their life in one line, then point back to the presentation, where they can see it.
You do NOT close. Closing belongs to a person on the phone or in the showroom.

AQUAZEN FACTS
- AquaZen, 7049 Russell Ave, Burnaby, BC. Visits by appointment. Phone and text 236-304-4424. Website aquazen.ca.
- Sells AquaSolus hot tubs (Series One, Two and Three), swim spas and mini pools. Own crew delivers from Whistler to Hope.
- Shaun McAvoy, the owner, has over twenty years in the hot tub industry, the last three consulting for hot tub stores. He started AquaZen to do it differently.
- The presentation is about hot tubs. If they're after a swim spa or mini pool, skip it: send the Find your Zen form (it covers swim spas and mini pools too) or offer the call.
- Never invent prices, stock, delivery dates, reviews, awards, customer stories or anything not given here. If you don't know, say you'll have the team confirm, and offer the call.`;

// The price ranges and promotion Noah may quote, from the live price list.
async function noahPricing(): Promise<string> {
  const db = admin();
  const { data: rows } = await db.from("product_costs").select("product_type, model, msrp, sale_price, product_lines(name, sort)");
  const { data: adds } = await db.from("addons").select("name, kind, sale_price, offered").eq("offered", true);
  const { data: promo } = await db.from("settings").select("v").eq("k", "noah_promo").maybeSingle();
  const upgrades = (adds ?? []).filter((a) => a.kind !== "delivery").reduce((t, a) => t + Number(a.sale_price || 0), 0);
  const delivery = Number((adds ?? []).find((a) => a.kind === "delivery")?.sale_price || 0);
  const byLine: Record<string, { zen: number[]; msrp: number[]; models: string[]; savings: number[] }> = {};
  // deno-lint-ignore no-explicit-any
  for (const r of (rows ?? []) as any[]) {
    if (!r.sale_price || !r.msrp) continue;
    const line = r.product_lines?.name || (r.product_type === "swim_spa" ? "Swim spas" : "Other");
    const b = byLine[line] ??= { zen: [], msrp: [], models: [], savings: [] };
    b.zen.push(Number(r.sale_price)); b.msrp.push(Number(r.msrp)); b.models.push(r.model);
    b.savings.push(Number(r.msrp) - Number(r.sale_price) + upgrades + delivery);
  }
  const $ = (n: number) => "$" + Math.round(n).toLocaleString("en-CA");
  const lines = Object.entries(byLine).map(([line, b]) =>
    `- ${line} (${b.models.join(", ")}): Zen price ${$(Math.min(...b.zen))} to ${$(Math.max(...b.zen))} (MSRP ${$(Math.min(...b.msrp))} to ${$(Math.max(...b.msrp))}). With the promotion, total savings off MSRP of about ${$(Math.min(...b.savings))} to ${$(Math.max(...b.savings))}.`);
  return `PRICES YOU MAY QUOTE (as ranges, plus tax; exact prices and inventory are confirmed by the team):
${lines.join("\n")}
- The upgrades: ${(adds ?? []).filter((a) => a.kind !== "delivery").map((a) => `${a.name} (${$(Number(a.sale_price))})`).join(", ")}. Local delivery: ${$(delivery)}.
CURRENT PROMOTION: ${promo?.v || "none"}
Share a range when they ask about price (never dodge it), then bring it back to value: the presentation shows what goes into the tub for that money, the Find your Zen form at the end finds the exact tub, and the team confirms the exact price.`;
}

// deno-lint-ignore no-explicit-any
async function noahThink(history: { role: string; text: string }[], extra = ""): Promise<any> {
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) throw new Error("no anthropic key");
  const convo = history.map((m) => `${m.role === "user" ? "THEM" : m.role === "team" ? "AQUAZEN TEAM MEMBER" : "NOAH"}: ${m.text}`).join("\n");
  const system = `${NOAH_METHOD}\n\n${await noahPricing()}`;
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: Deno.env.get("NOAH_MODEL") || Deno.env.get("ADS_MODEL") || "claude-sonnet-5-5", max_tokens: 1200, system,
      messages: [{ role: "user", content: `THE CONVERSATION SO FAR:\n${convo || "(none)"}\n\n${extra || "Write Noah's next message."}
Reply with only JSON: {"reply":"Noah's message","handoff":false,"lead":{"name":"","phone":"","email":"","best_time":"","interest":"","summary":""}}
Set handoff to true only when they've given a phone number for a call, or they're ready to buy and gave their details, or they asked for a person. Fill lead with whatever they've told you so far.` }],
    }),
  });
  if (!res.ok) throw new Error(`claude ${res.status} ${await res.text().catch(() => "")}`);
  const out = await res.json();
  // deno-lint-ignore no-explicit-any
  const text = (out.content ?? []).filter((c: any) => c.type === "text").map((c: any) => c.text).join("");
  const j = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
  j.reply = String(j.reply ?? "").replace(/\s*[—–]\s*/g, ", ").trim().slice(0, 1900);
  return j;
}

async function pageToken(): Promise<string> {
  const token = Deno.env.get("META_TOKEN")!;
  const s = await metaSettings();
  return (await graph(s.page, token, { fields: "access_token" })).access_token;
}
// Returns Meta's message id so the echo of Noah's own message can be recognised.
async function noahSend(psid: string, text: string, ptoken: string): Promise<string | null> {
  const s = await metaSettings();
  const r = await graph(`${s.page}/messages`, ptoken, { recipient: { id: psid }, messaging_type: "RESPONSE", message: { text } }, "POST");
  return r?.message_id ? String(r.message_id) : null;
}

// Is this echo one of Noah's own messages? Messenger echoes carry our app ID; Instagram echoes don't,
// so also match the message id or the same text Noah sent in the last few minutes.
async function isNoahEcho(threadId: string, mid: string, text: string): Promise<boolean> {
  const db = admin();
  for (let i = 0; i < 3; i++) {
    if (mid) {
      const { data } = await db.from("chat_messages").select("id").eq("thread_id", threadId).eq("mid", mid).limit(1);
      if (data?.length) return true;
    }
    const since = new Date(Date.now() - 5 * 60e3).toISOString();
    const { data: recent } = await db.from("chat_messages").select("text").eq("thread_id", threadId).eq("role", "noah").gte("created_at", since);
    if ((recent ?? []).some((r) => r.text.trim() === text.trim())) return true;
    await new Promise((r) => setTimeout(r, 2000)); // the echo can arrive before Noah's row is saved
  }
  return false;
}

async function noahHandoff(threadId: string, channel: string, lead: Record<string, string>, history: { role: string; text: string }[]) {
  const db = admin();
  const { data: t } = await db.from("chat_threads").select("*").eq("id", threadId).single();
  const stamp = new Date().toLocaleDateString("en-CA", { timeZone: "America/Vancouver", year: "numeric", month: "short", day: "numeric" });
  const notes = [`Noah on ${channel === "instagram" ? "Instagram" : "Messenger"} (${stamp}):`,
    lead.interest ? `- Interested in: ${lead.interest}` : "", lead.best_time ? `- Best time to call: ${lead.best_time}` : "",
    lead.summary ? `- ${lead.summary}` : "", "", ...history.slice(-14).map((m) => `${m.role === "user" ? "Them" : m.role === "team" ? "Team" : "Noah"}: ${m.text}`)].filter((x) => x !== null).join("\n").slice(0, 7000);
  let customerId = t?.customer_id;
  const fields = { name: lead.name || t?.name || "Social media lead", cell: lead.phone || null, email: lead.email || null, heard_about: channel === "instagram" ? "Instagram: Noah" : "Messenger: Noah" };
  if (customerId) {
    const { data: c } = await db.from("customers").select("notes").eq("id", customerId).single();
    await db.from("customers").update({ ...Object.fromEntries(Object.entries(fields).filter(([, v]) => v)), notes: [notes, c?.notes].filter(Boolean).join("\n\n").slice(0, 8000) }).eq("id", customerId);
  } else {
    const { data: c } = await db.from("customers").insert({ ...fields, notes }).select("id").single();
    customerId = c?.id;
  }
  await db.from("chat_threads").update({ handed_off_at: new Date().toISOString(), customer_id: customerId, name: lead.name || t?.name }).eq("id", threadId);
  try {
    await sendEmail({
      from: FROM, to: Deno.env.get("LEAD_TO") || "shaun@aquazen.ca", reply_to: REPLY_TO,
      subject: `Noah handed you a lead: ${fields.name}${lead.phone ? ", " + lead.phone : ""}`,
      html: emailShell({ preheader: "A social media lead is ready for a person.", body:
        `<p>Noah passed a ${channel === "instagram" ? "Instagram" : "Messenger"} conversation to the team.</p>
<p><b>${escapeHtml(fields.name)}</b><br>${escapeHtml(lead.phone || "no phone yet")}${lead.email ? "<br>" + escapeHtml(lead.email) : ""}${lead.best_time ? "<br>Best time: " + escapeHtml(lead.best_time) : ""}</p>
${lead.interest ? `<p>Interested in: ${escapeHtml(lead.interest)}</p>` : ""}${lead.summary ? `<p>${escapeHtml(lead.summary)}</p>` : ""}
<p style="color:${MUTED}">They're in the staff portal's Customers tab as a new lead, with the conversation in the notes.</p>` }),
    });
  } catch (e) { console.error("noah handoff email", e); }
}

// Handle one incoming message: save it, wait a moment for anything else they type, then answer.
async function noahIncoming(channel: string, psid: string, text: string, mid: string) {
  const db = admin();
  const now = new Date().toISOString();
  let { data: t } = await db.from("chat_threads").select("*").eq("channel", channel).eq("psid", psid).maybeSingle();
  if (!t) {
    const ins = await db.from("chat_threads").insert({ channel, psid, last_user_at: now }).select("*").single();
    t = ins.data;
    // Their name, if Meta shares it.
    try {
      const p = await graph(psid, await pageToken(), { fields: channel === "instagram" ? "name,username" : "first_name,last_name" });
      const name = [p.first_name, p.last_name].filter(Boolean).join(" ") || p.name || p.username;
      if (name) await db.from("chat_threads").update({ name }).eq("id", t!.id);
    } catch { /* fine without it */ }
  }
  const ins = await db.from("chat_messages").insert({ thread_id: t!.id, role: "user", text: text.slice(0, 4000), mid: mid || null });
  if (ins.error) return; // a duplicate delivery from Meta
  await db.from("chat_threads").update({ last_user_at: now, updated_at: now }).eq("id", t!.id);

  const on = (await db.from("settings").select("v").eq("k", "noah_on").maybeSingle()).data?.v !== "off";
  if (!on) return;
  if (t!.status === "human" && t!.human_until && new Date(t!.human_until) > new Date()) return;

  const ptoken = await pageToken();
  try { await graph(`${(await metaSettings()).page}/messages`, ptoken, { recipient: { id: psid }, sender_action: "typing_on" }, "POST"); } catch { /* optional */ }
  await new Promise((r) => setTimeout(r, 5000));
  // If they sent more while Noah was waiting, the newest message answers everything.
  const { data: last } = await db.from("chat_messages").select("role, mid").eq("thread_id", t!.id).order("created_at", { ascending: false }).limit(1).single();
  if (last && last.role === "user" && last.mid && mid && last.mid !== mid) return;

  const { data: msgs } = await db.from("chat_messages").select("role, text").eq("thread_id", t!.id).order("created_at").limit(60);
  const history = msgs ?? [];
  const extra = t!.handed_off_at ? "The team already has their details and will call. Keep helping warmly, and don't ask for their details again." : "";
  const j = await noahThink(history, extra);
  if (!j.reply) return;
  await db.from("chat_messages").insert({ thread_id: t!.id, role: "noah", text: j.reply, mid: await noahSend(psid, j.reply, ptoken) });
  await db.from("chat_threads").update({ last_bot_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", t!.id);
  if (j.handoff && !t!.handed_off_at) await noahHandoff(t!.id, channel, j.lead || {}, [...history, { role: "noah", text: j.reply }]);
}

async function verifyMeta(raw: string, sig: string | null): Promise<boolean> {
  const secret = Deno.env.get("META_APP_SECRET");
  if (!secret || !sig?.startsWith("sha256=")) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw)));
  const hex = Array.from(mac).map((b) => b.toString(16).padStart(2, "0")).join("");
  const given = sig.slice(7);
  if (given.length !== hex.length) return false;
  let diff = 0; for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ given.charCodeAt(i);
  return diff === 0;
}

// GET: Meta's webhook check. POST: messages from Messenger and Instagram.
async function route_meta_webhook(req: Request): Promise<Response> {
  const url = new URL(req.url);
  if (req.method === "GET") {
    if (url.searchParams.get("hub.mode") === "subscribe" && url.searchParams.get("hub.verify_token") === (Deno.env.get("META_VERIFY_TOKEN") || "aquazen-noah-webhook"))
      return new Response(url.searchParams.get("hub.challenge") ?? "", { status: 200 });
    return new Response("Forbidden", { status: 403 });
  }
  const raw = await req.text();
  if (!(await verifyMeta(raw, req.headers.get("x-hub-signature-256")))) { console.error("meta-webhook: bad or missing signature"); return new Response("Forbidden", { status: 403 }); }
  // deno-lint-ignore no-explicit-any
  let body: any = {};
  try { body = JSON.parse(raw); } catch { return new Response("ok"); }
  const channel = body.object === "instagram" ? "instagram" : body.object === "page" ? "messenger" : "";
  const jobs: Promise<unknown>[] = [];
  if (channel) {
    for (const entry of body.entry ?? []) {
      for (const ev of entry.messaging ?? []) {
        const m = ev.message;
        if (!m || m.is_deleted) continue;
        if (m.is_echo) {
          // A person on the team replied from the inbox (Noah's own messages carry our app's ID): Noah steps back for 24 hours.
          if (String(m.app_id ?? "") !== String(Deno.env.get("META_APP_ID") || "2194629054456528")) {
            const psid = String(ev.recipient?.id ?? "");
            jobs.push((async () => {
              const db = admin();
              const { data: t } = await db.from("chat_threads").select("id").eq("channel", channel).eq("psid", psid).maybeSingle();
              if (t && await isNoahEcho(t.id, String(m.mid ?? ""), String(m.text ?? ""))) return;
              if (t) {
                await db.from("chat_threads").update({ status: "human", human_until: new Date(Date.now() + 24 * 3600e3).toISOString() }).eq("id", t.id);
                if (m.text) await db.from("chat_messages").insert({ thread_id: t.id, role: "team", text: String(m.text).slice(0, 4000), mid: m.mid || null });
              }
            })());
          }
          continue;
        }
        const text = m.text || (m.attachments?.length ? "(sent a photo or attachment)" : "");
        if (!text) continue;
        jobs.push(noahIncoming(channel, String(ev.sender?.id ?? ""), String(text), String(m.mid ?? "")).catch((e) => console.error("noah", e)));
      }
    }
  }
  const all = Promise.all(jobs);
  if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(all); else await all;
  return new Response("ok", { status: 200 });
}

// Cron, every 15 minutes: one pattern-interrupt follow-up for people who went quiet, inside Meta's 24-hour window.
async function route_noah_followup(req: Request): Promise<Response> {
  const db = admin();
  const { data: ok } = await db.rpc("check_cron_secret", { s: req.headers.get("x-cron-secret") ?? "" });
  if (!ok) return new Response("Forbidden", { status: 403 });
  const on = (await db.from("settings").select("v").eq("k", "noah_on").maybeSingle()).data?.v !== "off";
  if (!on || !Deno.env.get("META_TOKEN")) return new Response("off");
  const now = Date.now();
  const { data: threads } = await db.from("chat_threads").select("*").eq("status", "bot").is("followup_at", null).is("handed_off_at", null)
    .lt("last_bot_at", new Date(now - 3 * 3600e3).toISOString()).gt("last_user_at", new Date(now - 22 * 3600e3).toISOString()).limit(20);
  let sent = 0;
  const ptoken = threads?.length ? await pageToken() : "";
  for (const t of threads ?? []) {
    if (!t.last_bot_at || !t.last_user_at || new Date(t.last_bot_at) < new Date(t.last_user_at)) continue; // they spoke last
    try {
      const { data: msgs } = await db.from("chat_messages").select("role, text").eq("thread_id", t.id).order("created_at").limit(60);
      const j = await noahThink(msgs ?? [], "They've gone quiet. Write ONE follow-up message using a pattern interrupt: unexpected, sincere and good to receive, tied to something they actually said. Never 'just checking in', never guilt or pressure, never a fake deadline. Make it easy to reply to. Keep it to one or two sentences. Set handoff to false.");
      if (!j.reply) continue;
      await db.from("chat_messages").insert({ thread_id: t.id, role: "noah", text: j.reply, mid: await noahSend(t.psid, j.reply, ptoken) });
      await db.from("chat_threads").update({ followup_at: new Date().toISOString(), last_bot_at: new Date().toISOString() }).eq("id", t.id);
      sent++;
    } catch (e) {
      console.error("noah followup", t.id, e);
      await db.from("chat_threads").update({ followup_at: new Date().toISOString() }).eq("id", t.id); // don't retry forever
    }
  }
  return new Response(JSON.stringify({ sent }), { headers: { "Content-Type": "application/json" } });
}

// Admins: Noah's switch, the promotion, conversations, pausing a chat, and a practice chat.
async function route_noah_admin(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsAuth(req) });
  const me = await menuOnly(req, "noah");
  if (!me) return jsonAuth(req, { error: "You don't have the Noah menu." }, 403);
  const db = admin();
  const b = req.method === "POST" ? await req.json().catch(() => ({})) : {};
  if (b.on !== undefined) await db.from("settings").upsert({ k: "noah_on", v: b.on ? "on" : "off" });
  if (b.promo !== undefined) await db.from("settings").upsert({ k: "noah_promo", v: String(b.promo).replace(/\s*[—–]\s*/g, ", ").slice(0, 1000) });
  if (b.thread_id && ["bot", "human"].includes(b.status)) await db.from("chat_threads").update({ status: b.status, human_until: b.status === "human" ? new Date(Date.now() + 30 * 24 * 3600e3).toISOString() : null }).eq("id", b.thread_id);
  if (b.subscribe) {
    // Tell Meta to send this Page's (and its Instagram's) messages to Noah.
    try {
      const st = await metaSettings();
      const r = await graph(`${st.page}/subscribed_apps`, await pageToken(), { subscribed_fields: "messages,message_echoes,messaging_postbacks" }, "POST");
      return jsonAuth(req, { subscribed: !!r.success });
    } catch (e) { return jsonAuth(req, { error: `Meta said: ${(e as Error).message}` }, 502); }
  }
  if (Array.isArray(b.practice)) {
    try {
      // deno-lint-ignore no-explicit-any
      const history = b.practice.slice(-30).map((m: any) => ({ role: m.role === "noah" ? "noah" : "user", text: String(m.text ?? "").slice(0, 2000) }));
      const j = await noahThink(history);
      return jsonAuth(req, { reply: j.reply, handoff: !!j.handoff, lead: j.lead });
    } catch (e) { console.error("noah practice", e); return jsonAuth(req, { error: "Noah didn't answer. Please try again." }, 502); }
  }
  if (b.thread) {
    const { data: msgs } = await db.from("chat_messages").select("role, text, created_at").eq("thread_id", String(b.thread)).order("created_at").limit(300);
    return jsonAuth(req, { messages: msgs ?? [] });
  }
  const s = await db.from("settings").select("k, v").in("k", ["noah_on", "noah_promo"]);
  const set = Object.fromEntries((s.data ?? []).map((r) => [r.k, r.v]));
  const { data: threads } = await db.from("chat_threads").select("id, channel, name, status, human_until, handed_off_at, followup_at, last_user_at, last_bot_at, customer_id").order("updated_at", { ascending: false }).limit(100);
  return jsonAuth(req, {
    on: set.noah_on !== "off", promo: set.noah_promo || "", threads: threads ?? [],
    ready: { token: !!Deno.env.get("META_TOKEN"), secret: !!Deno.env.get("META_APP_SECRET"), ai: !!Deno.env.get("ANTHROPIC_API_KEY") },
  });
}

const ROUTES: Record<string, (req: Request) => Promise<Response>> = {
  "ads-write": route_ads_write, "ads-image": route_ads_image, "meta-status": route_meta_status, "meta-geo": route_meta_geo, "ads-stats": route_ads_stats, "ads-control": route_ads_control, "ads-advice": route_ads_advice, "ads-apply": route_ads_apply, "meta-post": route_meta_post, "meta-ad": route_meta_ad, "meta-webhook": route_meta_webhook, "noah-followup": route_noah_followup, "noah-admin": route_noah_admin,
  "login-link": route_login_link, "invite-staff": route_invite_staff, "team-menus": route_team_menus, "send-for-signature": route_send_for_signature,
  "signing": route_signing, "agreement-pdf": route_agreement_pdf,
  "agreement-print": route_agreement_print, "paper-signed": route_paper_signed,
  "sale-progress": route_sale_progress, "customer-delete": route_customer_delete, "sale-delete": route_sale_delete, "sale-reopen": route_sale_reopen, "past-sale": route_past_sale, "lead-assign": route_lead_assign,
  "qb-status": route_qb_status, "qb-connect": route_qb_connect, "qb-callback": route_qb_callback,
  "deliveries": route_deliveries, "delivery-record": route_delivery_record, "portal-details": route_portal_details,
  "service-request": route_service_request, "service-list": route_service_list, "service-update": route_service_update,
  "pay": route_pay, "pay-link": route_pay_link, "helcim-logo": route_helcim_logo,
  "qb-settings": route_qb_settings, "qb-invoice": route_qb_invoice, "qb-balance-invoice": route_qb_balance_invoice, "qb-sync": route_qb_sync,
};
Deno.serve(async (req) => {
  const name = new URL(req.url).pathname.split("/").filter(Boolean).pop() ?? "";
  const fn = ROUTES[name];
  if (!fn) return new Response("Not found", { status: 404, headers: corsAuth(req) });
  try { return await fn(req); }
  catch (e) { console.error(name, e); return jsonAuth(req, { error: "Something went wrong on our end. Please try again." }, 500); }
});
