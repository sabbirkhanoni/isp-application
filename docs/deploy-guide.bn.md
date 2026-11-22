# চালু করার গাইড (বাংলা) — সবকিছু ফ্রি প্ল্যানে

ক্রম: **GitHub → Supabase → Render → Cloudflare Pages → UptimeRobot → প্রথম লগইন → পরীক্ষা**।
প্রতিটি ধাপে যা কপি করবেন তা একটি নোটে জমা রাখুন।

## ০. আগে একটি গোপন লেখা বানান

`PROXY_SECRET` — ৩২+ অক্ষরের যেকোনো এলোমেলো লেখা (পাসওয়ার্ড জেনারেটর ব্যবহার করুন)। একই লেখা Render ও Cloudflare — দুই জায়গাতেই বসবে।

## ১. GitHub

নতুন **private** repository খুলে প্রজেক্টের ফাইলগুলো আপলোড/push করুন।

## ২. Supabase (ডাটাবেস)

1. New project → **Region: Singapore** (Render-এর জন্যও Singapore নেবেন — দুটো কাছাকাছি থাকলে সিস্টেম দ্রুত চলে)।
2. Database password দিন ও নোটে রাখুন।
3. Project Settings → Database → Connection string থেকে দুটি লিংক নিন:
   - **Transaction pooler** (পোর্ট 6543) → `DATABASE_URL`
   - **Direct connection** বা Session pooler (পোর্ট 5432) → `DIRECT_URL`

## ৩. Render (সার্ভার)

1. New → **Blueprint** → আপনার repo বেছে নিন (`render.yaml` নিজে সব সেট করে)। Region: **Singapore**।
2. যে মানগুলো আপনাকে দিতে হবে:
   | নাম               | মান                                                                                        |
   | ----------------- | ------------------------------------------------------------------------------------------ |
   | `DATABASE_URL`    | Supabase pooler লিংক                                                                       |
   | `DIRECT_URL`      | Supabase direct লিংক                                                                       |
   | `ALLOWED_ORIGINS` | আপনার Cloudflare সাইটের ঠিকানা (ধাপ ৪-এর পরে বসাবেন), যেমন `https://isp-billing.pages.dev` |
   | `PROXY_SECRET`    | ধাপ ০-এর লেখা                                                                              |
3. ডাটাবেসের টেবিল নিজে নিজে তৈরি হবে (সার্ভার চালুর আগে মাইগ্রেশন চলে)।
4. Deploy শেষে `https://…onrender.com/health` খুললে `ok` দেখা যাবে।
5. **প্রথম অ্যাডমিন বানানো (একবার):** নিজের কম্পিউটারে প্রজেক্টের `apps/api/.env` ফাইলে `DATABASE_URL`, `SEED_ADMIN_USERNAME`, `SEED_ADMIN_PASSWORD` বসিয়ে `npm run db:seed -w @isp/api` চালান। (কম্পিউটারে চালাতে না পারলে আমাকে বলুন, সহজ উপায় করে দেব।)

> ফ্রি Render ১৫ মিনিট ব্যবহার না হলে ঘুমায়। ধাপ ৫-এর UptimeRobot তাকে জাগিয়ে রাখে। ঘুমিয়ে থাকলেও কিছু হারায় না — জেগে উঠে বাকি কাজ ধরে নেয়।

## ৪. Cloudflare Pages (ওয়েবসাইট)

1. Workers & Pages → Create → Pages → GitHub repo যুক্ত করুন।
2. Build command: `npm ci && npm run build:contracts && npm run build -w @isp/web`
3. Build output directory: `apps/web/dist`
4. Environment variables (Production):
   - `BACKEND_ORIGIN` = Render-এর ঠিকানা (যেমন `https://isp-api.onrender.com`)
   - `PROXY_SECRET` = ধাপ ০-এর লেখা
5. Deploy শেষে সাইটের ঠিকানা Render-এর `ALLOWED_ORIGINS`-এ বসিয়ে Render একবার Restart করুন।

## ৫. UptimeRobot

New monitor → HTTP(s) → URL: `https://<render-ঠিকানা>/health` → interval **5 minutes**।

## ৬. ব্যাকআপ (GitHub)

Repo → Settings → Secrets → `BACKUP_DATABASE_URL` (Supabase direct লিংক) ও `BACKUP_AGE_PUBLIC_KEY` (age কী; `age-keygen` দিয়ে বানানো, **private অংশ নিরাপদ জায়গায় রাখুন**)। প্রতি রাতে এনক্রিপ্টেড ব্যাকআপ জমবে, ৩০ দিন থাকে। ব্যাকআপ থেকে ফেরত আনা পরীক্ষা করা হয়েছে (`pg_restore`)।

## ৭. চালুর আগে চেকলিস্ট

- [ ] অ্যাডমিন লগইন হচ্ছে; **ডিফল্ট পাসওয়ার্ড বদলানো হয়েছে**
- [ ] প্যাকেজ ও স্টাফ অ্যাকাউন্ট বানানো
- [ ] রাউটার যুক্ত করে "Test" বোতামে সংযোগ ঠিক দেখাচ্ছে (`ROUTER_DRY_RUN=true` অবস্থায় কেবল লগ হয়, রাউটার বদলায় না)
- [ ] পুরনো গ্রাহক CSV থেকে ইমপোর্ট: প্রথমে "পরীক্ষা", ভুল না থাকলে "ইমপোর্ট"
- [ ] মাসের ১ তারিখে বিল তৈরি হয়েছে কি না দেখুন; একজন গ্রাহকের ইনভয়েস খুলে মিলিয়ে নিন
- [ ] bKash স্টেটমেন্ট CSV আপলোড করে "রিভিউ" তালিকা দেখুন
- [ ] ১–২ জন পরীক্ষামূলক গ্রাহকে সাসপেন্ড/অ্যাক্টিভ চালিয়ে রাউটারে মেলান, তারপর `ROUTER_DRY_RUN=false` করুন
- [ ] SMS: প্রোভাইডার ঠিক হলে `SMS_DRIVER=http`, `SMS_API_URL`, `SMS_API_KEY` দিন
- [ ] অটো-সাসপেন্ড (`AUTO_SUSPEND=true`) সবশেষে, কয়েক মাস চলার পর

## ৮. সমস্যা হলে

| লক্ষণ                          | কী করবেন                                                                         |
| ------------------------------ | -------------------------------------------------------------------------------- |
| সাইট খোলে কিন্তু লগইন হয় না   | `ALLOWED_ORIGINS`, `BACKEND_ORIGIN`, `PROXY_SECRET` দুই জায়গায় একই কি না দেখুন |
| প্রথম খুলতে ৩০–৬০ সেকেন্ড লাগে | Render ঘুমিয়ে ছিল; UptimeRobot ঠিক আছে কি না দেখুন                              |
| রাউটারের কাজ "Failed"          | সেটিংস → নেটওয়ার্ক জব পেজে কারণ লেখা থাকে; ঠিক করে "Retry"                      |
| ডাটা হারালে                    | সর্বশেষ ব্যাকআপ `age -d` দিয়ে খুলে `pg_restore` করুন                            |
