# AquaZen website

Static site for AquaZen (legal name Aqua Zen Wellness Consulting, operating as AquaZen), Shaun McAvoy's hot tub, swim spa and mini pool store at 7049 Russell Ave, Burnaby, BC. Live at https://aquazen.ca via GitHub Pages from `main` (root). Phone 236-304-4424, email shaun@aquazen.ca.

- Products: Aquasolus (Canadian range at https://aquasolus.com/ca/). No O-Care (Lower Mainland water is soft). Photos in `assets/img/` came from Aquasolus.
- Design: Apple-style product page. Black and #f5f5f7 sections, system font (SF Pro on Apple, Inter fallback), the logo's sunset gradient used only on "Find your Zen" headlines. Scroll effects in `assets/js/site.js` respect reduced motion.
- Pages: `index.html` (home), `find-your-zen/` (the main CTA and lead capture). Styles in `assets/css/site.css`.
- Brand language: Why, How, What (SCP / Start With Why). The Why is a place of peace at home; hot tub time is "Zen Time"; main CTA is "Find your Zen". Do not use "Stop going. Start being." Founder: over twenty years in the industry, last three consulting for hot tub stores. Never mention Bishop's.
- Gap story: stores hold back on equipment to protect chemical and service revenue; AquaZen sells the right equipment from day one because the best experience keeps you busy.
- Copy rules: no em dashes, Canadian spelling, Shaun's warm plain voice, no invented prices, statistics, reviews or customer stories. Every customer message explains why.
- Find your Zen recommendations are computed in `assets/js/finder.js` and sent to Shaun only, never shown to the customer.
- Backend: Supabase project `zfqzajshbjfmflbttabq` (AquaZen, in the Sales Closers Playbook org). Table `leads` (RLS on, no public policies). Edge function `lead` (`supabase/functions/lead/index.ts`, verify_jwt false) saves the lead and emails via Resend from shaun@mail.aquazen.ca (domain verified in the SCP Resend account). Secrets: RESEND_API_KEY, optional LEAD_TO. Never put keys in the repo or in chat.
- DNS is at name.com. Google Workspace MX records serve shaun@aquazen.ca; keep them. Keep `CNAME`.
