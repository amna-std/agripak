# 🌾 AgriPak — زرعی پاکستان

**An AI farming advisor for Pakistani smallholder farmers.**
Ask a question in Urdu, photograph a sick leaf, check today's real mandi rate, and find the
government scheme you actually qualify for — from a cheap Android phone, in your own language.

> 🔗 **Live app:** _(deployed URL goes here)_
> 📦 **Repository:** _(public GitHub URL goes here)_

---

## 1. The problem, and who has it

Pakistan has roughly **8 million farms**, and the overwhelming majority are smallholdings of
2–12 acres. The people running them make high-stakes decisions on thin margins with very little
reliable information:

- **"What is wrong with my crop?"** The nearest agriculture extension officer may be a district
  office away and a working day lost. So farmers guess, or take the word of the input dealer who
  profits from selling them a pesticide — and the wrong spray costs money *and* the crop. Nutrient
  deficiency, salinity injury and herbicide drift all look like disease to an untrained eye, and
  each needs a completely different response.
- **"What is my crop actually worth today?"** Mandi rates are published by AMIS Punjab, but on a
  government web page that is unusable on a phone. A farmer who doesn't know the rate negotiates
  against a middleman who does.
- **"Which government scheme can I get?"** The Kissan Card, the Green Tractor Scheme and the solar
  tubewell grant are all real money, but eligibility is buried in press releases and portals.
- **The information that does exist is in English.** Most farmers are more comfortable in Urdu,
  Punjabi, Sindhi or Pashto — and some read little of any of them.

**AgriPak is for that farmer.** Not for agribusiness, not for a co-operative with an agronomist on
staff — for someone with a few acres, a basic smartphone, and a problem in the field today.

### Why this isn't another crop-disease demo

Most "AI farming" projects are a plant-disease image classifier wrapped in a web page. AgriPak is
built around three things such a demo cannot do:

1. **It is honest about uncertainty.** Point it at a blurry photo, a healthy plant, or a tractor,
   and it says so instead of naming a disease. That is a deliberate, tested behaviour (see §4).
2. **It is Pakistan-specific, not "South Asia" flavoured.** Left alone, a language model answers
   Pakistani wheat questions with Indian MSP figures and PM-KISAN. Everything here — the disease
   priors, the scheme list, the units, the seasons — is written against Pakistani reality.
3. **It uses real live data**, and labels it when it can't (see the honesty note in §3).

---

## 2. Features

Every feature listed here works against live data or a live model. Nothing in this list is a mockup.

### 🤖 AI farming assistant — chat
Ask anything about your farm in **English, Urdu, Punjabi, Sindhi or Pashto**; the reply comes back
in the language you asked in. Multi-turn, so follow-up questions keep their context. Answers are
read aloud on request, for users with limited literacy.

### 📷 AI crop disease diagnosis — photograph a leaf
Take a photo with the phone camera, get back: the likely disease with its **local Urdu name**,
a calibrated confidence, severity, symptoms, a treatment plan with **Pakistani product names and
per-acre dosages**, prevention, organic alternatives, and a clear "go see a human" threshold.

### 🌤️ Weather + agricultural advisory
Current conditions and a 7-day forecast for **35+ locations across all four provinces plus AJK,
GB and Islamabad** — not one hardcoded city. Translated into farming advice: when to irrigate,
when spraying will simply wash off, heat-stress and frost warnings.

### 📈 Live crop prices
**Wholesale mandi rates** from AMIS Punjab plus **retail bazaar prices** from the PBS weekly survey
covering **17 cities across Punjab, Sindh, KP, Balochistan and Islamabad**. Shown in **PKR** per
100 kg *and* per **maund** (~40 kg), the unit farmers actually trade in. Filter by crop and city,
with 30-day trends that never mix wholesale and retail into one line.

### 🏛️ Government schemes + eligibility checker
Real Pakistani schemes — **CM Punjab Kissan Card**, **Green Tractor Scheme**, **solar tubewell
subsidy**, **ZTBL loans**, **Benazir Hari Card** and more — with benefit amounts, eligibility,
required documents (CNIC, Fard/land record) and official links. Enter your province, land size and
tenure to see what you qualify for.

### 🌱 AI crop advisor
Province, land size, soil type, season and budget in; a ranked shortlist of crops out, with the
reasoning shown so the farmer can disagree with it.

### 🛒 Marketplace
Browse verified inputs (seed, fertiliser, pesticide, equipment) and list your own harvest for sale
in maunds at your asking price.

### 👨‍🌾 Community + expert consultations
A district-aware feed where farmers compare notes, plus bookable consultations with agricultural
experts.

### 🌐 Five languages, right-to-left first
English, **اردو**, **پنجابی**, **سنڌي**, **پښتو**. The four Pakistani languages render
right-to-left with proper Nastaliq typography — not Latin text in a mirrored box.

### 📱 Built for the actual device
Mobile-first at 360px, tap targets sized for use with gloves on, high contrast for reading in
direct sunlight, and a light/dark theme.

---

## 3. Tools, services and models

| Layer | Choice | Why |
|---|---|---|
| Framework | **Next.js 14** (App Router) | One deployable unit — pages and API together |
| Language | **TypeScript** | |
| UI | **Tailwind CSS**, **shadcn/ui**, **Framer Motion**, **Recharts** | |
| AI | **Google Gemini** (`gemini-flash-latest`) via `@google/generative-ai` | Multimodal, so the same model powers chat *and* photo diagnosis |
| Database | **MongoDB Atlas** (M0) with **Mongoose** | |
| Auth | **JWT** + **bcryptjs** | |
| Weather | **Open-Meteo** | Free, accurate over Pakistan, **needs no API key** |
| Prices — wholesale | **AMIS Punjab** (`amis.pk`) parsed with **cheerio** | Wholesale mandi rates; the only free source for them |
| Prices — retail | **PBS SPI** (`pbs.gov.pk`) weekly `.xlsx` | Government retail survey, 17 cities nationwide |
| Hosting | **Vercel** (serverless functions + cron) | |

### A note on data honesty

Prices come from two government sources that measure different things: **AMIS Punjab** publishes
*wholesale* mandi rates (Punjab only), and the **PBS** weekly survey publishes *retail* bazaar
prices for 17 cities nationwide. Retail sits well above wholesale, so the two are never averaged
together — every row carries its own `source` and `priceType`, and the UI labels both.

Each response is also tagged **`amis`** / **`pbs`** (fetched live), **`cache`** (last known good,
stored in MongoDB) or **`sample`**, and the badge is always visible. Cached numbers are never
dressed up as live, and the app never invents a price. Where no feed exists at all —
Gilgit-Baltistan and Azad Jammu & Kashmir — the UI says so instead of showing an empty list.

---

## 4. The AI feature and the instructions behind it

The AI is **not** a thin wrapper around "you are a helpful farming assistant". The prompts are
**~1,250 lines of hand-written instruction** in [`lib/prompts/`](lib/prompts/), composed from shared
blocks:

| File | Purpose |
|---|---|
| [`shared.ts`](lib/prompts/shared.ts) | Persona, Pakistan context, language policy, honesty policy, chemical-safety policy, JSON rules |
| [`chat.ts`](lib/prompts/chat.ts) | The conversational assistant → `POST /api/ai/chat` |
| [`diagnosis.ts`](lib/prompts/diagnosis.ts) | Photo disease diagnosis → `POST /api/ai/diagnose` |
| [`advisor.ts`](lib/prompts/advisor.ts) | Crop recommendation → `POST /api/ai/advisor` |

### The persona

```
You are "AgriPak Sahayak" (اگری پاک سہایک), an experienced Pakistani agricultural
extension officer with 20 years of field service. You have worked in the Punjab
Agriculture Extension Department, spent seasons in the Sindh rice belt, and
advised orchard growers in Balochistan and Gilgit-Baltistan. You are speaking to
a real smallholder farmer — typically 2 to 12 acres, often rented or shared land,
tight cash, no cold storage, and a family that eats what the field does not sell.

How a good extension officer behaves, and how you must behave:
- You talk like a person standing at the edge of the field, not like a textbook.
- You give the ONE thing to do first, then the rest.
- You never make the farmer feel stupid for asking, and you never lecture.
- You know that "spend Rs 20,000 on a new machine" is not advice a 4-acre farmer
  can use. You always reach for the cheapest option that actually works.
- You know when a problem is beyond a photo or a chat, and you say so plainly.
```

### The four problems the diagnosis prompt is written to solve

These are the failure modes that separate a usable tool from a dangerous one:

1. **Confident nonsense.** A vision model asked "what disease is this?" will *always* name a
   disease — from a blurry photo, from a healthy plant, from a photo of a goat. The prompt forces
   an image-quality and is-this-even-a-plant check *first*, and makes `healthy`, `not_a_plant` and
   `unclear` first-class expected answers.
2. **Wrong continent.** Left alone the model reaches for US/Indian extension literature and
   recommends products not sold in Pakistan. The prompt carries a Pakistan-specific disease list
   with the names farmers actually use.
3. **Look-alikes.** Nutrient deficiency, salinity injury, herbicide drift, water stress and sunburn
   are routinely misread as disease — and each needs a different response. Spraying fungicide on a
   zinc deficiency wastes money and loses the crop anyway. The prompt makes the model weigh abiotic
   causes explicitly and rank alternatives.
4. **Calibration.** "94% confident" from a language model is decoration. The prompt defines what
   each confidence band must *mean* and ties low confidence to a mandatory referral to a human.

### It behaves — verified, not assumed

| Input | Output |
|---|---|
| Photo of **tractors** | `isPlant: false`, `confidence: 0`, no disease invented, "please photograph the affected plant" |
| Illustration of a rusted leaf | Identified **leaf rust**, prescribed **Tebuconazole 250 EC, 200 ml/acre**, flagged 30–50% yield loss at grain filling — **and noticed it was a drawing**, asking for a real photo |
| *(Urdu)* "my wheat is turning yellow" | Noted that **wheat's Rabi season ends before July**, redirected, then gave urea and zinc-sulphate dosages per acre |

Every diagnosis ships with a disclaimer that it is a reading of a photograph, not a lab test.

---

## 5. Screenshots

_(added after deployment)_

---

## 6. Running it yourself

### Prerequisites
Node.js 18+, a free **MongoDB Atlas** cluster, and a free **Google Gemini** API key.

```bash
git clone <your-repo-url>
cd agripak
npm install
```

Create `.env.local`:

```env
MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/agripak
JWT_SECRET=<run: openssl rand -base64 48>
GEMINI_API_KEY=<from https://aistudio.google.com/apikey>
GEMINI_MODEL=gemini-flash-latest
```

> **Weather and mandi prices need no keys.** Open-Meteo and AMIS are both open.

Seed the demo data and start:

```bash
npm run seed
npm run dev          # http://localhost:5000
```

**Demo login —** mobile `03001234567`, password `password123`

### Deploying to Vercel
Import the repo, add the same four environment variables, and deploy. `vercel.json` registers a
cron that refreshes mandi prices every 6 hours.

> ⚠️ In Atlas → **Network Access**, allow `0.0.0.0/0`. Vercel functions have no fixed IP.

---

## 7. Engineering notes

A few decisions worth calling out:

- **Serverless by design.** Every one of the ~48 endpoints is an App Router route handler, so the
  whole app deploys as one Vercel project with no separate API server to run. The MongoDB
  connection is cached on `globalThis` so concurrent lambdas reuse one pool instead of exhausting
  the Atlas connection limit, and all 34 Mongoose models are registered behind
  `mongoose.models.X || mongoose.model(...)` guards — without them a recycled lambda throws
  `OverwriteModelError` on its second invocation.
- **Scheduled work runs on Vercel Cron**, not an in-process scheduler: mandi prices refresh every
  6 hours, government schemes weekly.
- **Two price providers, never blended.** AMIS Punjab publishes *wholesale* mandi rates; PBS SPI
  publishes *retail* bazaar prices. Retail runs well above wholesale, so mixing them into one
  trend line produced a phantom 39% price crash during testing. Every row now carries its own
  `source` and `priceType`, and the two are grouped separately in charts and labelled in the UI.
- **The app says what it does not know.** Gilgit-Baltistan and Azad Jammu & Kashmir publish no
  price feed, so the UI states that rather than showing an empty list that reads as "no change".
  Cached and sample figures are badged as such and never presented as live.
- **AI-generated prices were tested and rejected.** Retrieval-grounded generation was evaluated as
  a way to cover the missing provinces. In testing it returned fabricated prices with fabricated
  citations — cited URLs that 404'd, and three different cities reporting identical figures. It is
  not used anywhere in the app. The AI answers agronomy questions; it never invents a number.
- **Guards against silent breakage.** `npm run check` runs three gates: TypeScript (zero errors,
  enforced at build time), an i18n check that fails if any `t()` key is missing or the five locales
  drift apart, and a check that every `/api/...` call in the frontend resolves to a real route
  handler.

---

*Built for Pakistani farmers. 🇵🇰*
