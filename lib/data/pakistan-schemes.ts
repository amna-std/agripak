/**
 * Real Pakistani government schemes for farmers.
 *
 * This file replaces the Indian scheme list the project was seeded with
 * (PM-KISAN, Soil Health Card, PMFBY, KCC …). Nothing Indian survives here.
 *
 * Accuracy rules:
 *  - Every figure below is taken from the government or central-bank source
 *    listed in that scheme's `sources` array. Figures that could not be
 *    verified against an official or mainstream source are omitted rather
 *    than guessed — `benefitAmount: null` means "the amount varies or is not
 *    published", not "we forgot".
 *  - Application windows for one-off rounds (Green Tractor Phase-III, Apna
 *    Khet Apna Rozgar round 1) are recorded with their real dates and the
 *    scheme is marked `closed` once the window has passed. Do not silently
 *    present a closed round as open.
 *  - Re-verify before each release. `lastVerified` says when each entry was
 *    last checked.
 *
 * THIS FILE IS THE BASELINE, NOT THE WHOLE TRUTH
 * ----------------------------------------------
 * Hand-research goes stale the moment it is committed. `lib/services/
 * schemesRefresh.ts` re-checks every entry here against the live web through
 * Gemini's Google Search grounding and stores a corrected overlay in MongoDB;
 * `POST /api/schemes/refresh` runs it and a weekly Vercel cron keeps it going.
 * The API serves the refreshed copy when one exists and falls back to this file
 * otherwise, so the schemes page is never empty.
 *
 * What that means for editing this file:
 *  - Keep it accurate. It is what farmers see whenever the refresh has not run,
 *    has failed, or found nothing it could cite.
 *  - Only `status`, `benefitAmount`, `benefitAmountLabel`, `applicationWindow`,
 *    `helpline` and `officialUrl` can be overwritten by a refresh, and only
 *    against a cited government or established-news source. Everything else —
 *    in particular `eligibilityRules`, which drives the eligibility matcher —
 *    can only change here, by a human.
 *
 * Last full human verification: 2026-07-25, every scheme checked against its
 * official source. Several government pages were found to be stale or broken;
 * where that is true it is recorded in that scheme's `caveats` rather than
 * quietly worked around.
 */

/* ------------------------------------------------------------------- types */

/** Short label used by the UI filters, as specified by the API contract. */
export type SchemeProvince = "Punjab" | "Sindh" | "KPK" | "Balochistan" | "Federal"

/** Canonical province names — these match the `state` field on the User model. */
export type CoveredProvince =
  | "Punjab"
  | "Sindh"
  | "Khyber Pakhtunkhwa"
  | "Balochistan"
  | "Azad Jammu & Kashmir"
  | "Gilgit-Baltistan"
  | "Islamabad Capital Territory"

export type SchemeCategory =
  | "credit"
  | "subsidy"
  | "insurance"
  | "mechanisation"
  | "energy"
  | "land"
  | "financial-assistance"

export type SchemeStatus = "active" | "closed" | "upcoming"

export type Tenure = "owner" | "owner-cum-tenant" | "tenant" | "sharecropper" | "landless"

export interface LandSizeRule {
  /** Acres. */
  min?: number
  max?: number
  /**
   * How to phrase this rule to a farmer, when the bare number would mislead.
   * "Limited to holdings of 0.1 acres or less" is technically what the rule
   * checks but nonsense to read; the label says "must not own agricultural
   * land" instead.
   */
  label?: string
}

/** Machine-checkable form of the human-readable `eligibility` bullets. */
export interface EligibilityRules {
  /** `"all"` means nationwide. */
  provinces: CoveredProvince[] | "all"
  landSizeAcres?: LandSizeRule
  /** Overrides `landSizeAcres` for the listed provinces. */
  landSizeByProvince?: Partial<Record<CoveredProvince, LandSizeRule>>
  tenure?: Tenure[]
  /** Applicant must have a revenue/land record (fard, Form VII, PLRA entry). */
  requiresLandRecord?: boolean
  requiresCnic?: boolean
  /** Things that rule an applicant out, shown to the farmer as-is. */
  disqualifiers?: string[]
  notes?: string[]
}

export interface Scheme {
  id: string
  name: string
  nameUr: string
  province: SchemeProvince
  provincesCovered: CoveredProvince[]
  category: SchemeCategory
  description: string
  descriptionUr: string
  /** Headline value in PKR, or null when the scheme has no single figure. */
  benefitAmount: number | null
  benefitAmountLabel: string
  benefits: string[]
  eligibility: string[]
  eligibilityRules: EligibilityRules
  documents: string[]
  howToApply: string
  applicationWindow?: string
  officialUrl: string
  implementingAgency: string
  helpline?: string
  status: SchemeStatus
  featured: boolean
  tags: string[]
  lastVerified: string
  sources: string[]
  /** Anything a farmer must know that does not fit the fields above. */
  caveats?: string[]
}

/* ----------------------------------------------------------------- schemes */

export const PAKISTAN_SCHEMES: Scheme[] = [
  {
    id: "cm-punjab-kissan-card",
    name: "CM Punjab Kissan Card",
    nameUr: "وزیراعلیٰ پنجاب کسان کارڈ",
    province: "Punjab",
    provincesCovered: ["Punjab"],
    category: "credit",
    description:
      "An interest-free production loan delivered on a bank card issued by the Bank of Punjab. The limit is worked out at Rs 30,000 per acre and the money can only be spent on approved inputs — fertiliser, seed and pesticide — bought from registered dealers. The season limit started at Rs 150,000 and the Chief Minister announced its doubling to Rs 300,000 per farmer per season in May 2025. The card runs for one crop season and is renewable for the next.",
    descriptionUr:
      "بینک آف پنجاب کی جانب سے جاری کردہ کارڈ کے ذریعے بلاسود زرعی قرض۔ حد فی ایکڑ 30,000 روپے کے حساب سے مقرر ہوتی ہے اور رقم صرف رجسٹرڈ ڈیلروں سے کھاد، بیج اور زرعی ادویات کی خریداری پر خرچ ہو سکتی ہے۔ فی کسان فی فصل حد بڑھا کر 3 لاکھ روپے کر دی گئی ہے۔",
    benefitAmount: 300000,
    benefitAmountLabel: "Up to Rs 300,000 interest-free per farmer per crop season (calculated at Rs 30,000 per acre)",
    benefits: [
      "Interest-free credit for one crop season, renewable for the next",
      "Spendable at registered fertiliser, seed and pesticide dealers",
      "No separate collateral — approval runs on the PLRA land record",
      "Repayment within the card validity period, with a grace month",
    ],
    eligibility: [
      "Farmer resident in Punjab holding a valid CNIC",
      "Landholding up to 12.5 acres",
      "Land record available in the Punjab Land Records Authority (PLRA) system",
      "Mobile SIM registered against the applicant's own CNIC",
      "Not an existing defaulter (checked through eCIB)",
    ],
    eligibilityRules: {
      provinces: ["Punjab"],
      landSizeAcres: { max: 12.5 },
      tenure: ["owner", "owner-cum-tenant"],
      requiresLandRecord: true,
      requiresCnic: true,
      disqualifiers: ["Existing loan default recorded in eCIB"],
      notes: ["The loan limit is Rs 30,000 per acre, so a smaller holding gets a proportionally smaller limit."],
    },
    documents: [
      "Valid CNIC",
      "PLRA land record (fard) in the applicant's name",
      "Mobile SIM registered on the applicant's own CNIC",
    ],
    howToApply:
      "Send an SMS in the format \"pkc <CNIC number>\" to 8070, or register through the Punjab Agriculture Department portal. Details are verified automatically against PLRA, NADRA and eCIB, after which the Bank of Punjab issues and dispatches the card.",
    officialUrl: "https://smu.punjab.gov.pk/kissan-card",
    implementingAgency: "Punjab Agriculture Department with PITB and the Bank of Punjab",
    helpline: "8070 (SMS registration)",
    status: "active",
    featured: true,
    tags: ["interest-free loan", "kissan card", "inputs", "punjab", "bank of punjab"],
    lastVerified: "2026-07-25",
    sources: [
      "https://smu.punjab.gov.pk/kissan-card",
      "https://punjab.gov.pk/cm-kissan-card-scheme",
      "https://tribune.com.pk/story/2546092/cm-doubles-kissan-card-loan-limit",
      "https://www.pakistantoday.com.pk/2025/05/16/punjab-cm-raises-kissan-card-loan-limit-announces-95-subsidy-on-tube-well-solarisation/",
      "https://www.nation.com.pk/01-Jul-2026/punjab-issues-900-000-kissan-cards-targets-one-million-farmers",
    ],
    caveats: [
      "The Rs 30,000-per-acre basis and the 12.5-acre ceiling are the published rules; the Rs 300,000 season limit reflects the Chief Minister's May 2025 announcement. Confirm your own sanctioned limit with the Bank of Punjab.",
      "The government's own pages at smu.punjab.gov.pk and punjab.gov.pk still print the original Rs 150,000 limit — they have not been updated since the 2024 launch. The higher limit is real; the stale page is not evidence against it. If a bank officer quotes you Rs 150,000, ask them to check the current circular.",
    ],
  },

  {
    id: "punjab-green-tractor-scheme",
    name: "CM Punjab Green Tractor Scheme",
    nameUr: "وزیراعلیٰ پنجاب گرین ٹریکٹر سکیم",
    province: "Punjab",
    provincesCovered: ["Punjab"],
    category: "mechanisation",
    description:
      "A subsidy on locally manufactured tractors, allocated to farmers by computerised balloting. The subsidy is set separately for each phase, so there is no single standing figure: the Punjab Portal's Rs 1,000,000 belongs to the original 2024 round, while Phase-III was reported at Rs 500,000 per tractor. Under Phase-III the selected farmer deposited a share of Rs 500,000 plus registration and number-plate fees, and the tractor had to be 50–65 HP. Phase-III applications closed on 31 January 2026 and no Phase-IV has been notified.",
    descriptionUr:
      "مقامی طور پر تیار شدہ ٹریکٹروں پر سبسڈی، جو کمپیوٹرائزڈ قرعہ اندازی کے ذریعے کسانوں کو دی جاتی ہے۔ سبسڈی کی رقم ہر فیز کے لیے الگ مقرر ہوتی ہے۔ فیز III میں منتخب کسان کو 5 لاکھ روپے اپنا حصہ جمع کرانا تھا اور ٹریکٹر 50 تا 65 ہارس پاور ہونا ضروری تھا۔ فیز III کی درخواستیں 31 جنوری 2026 کو بند ہو گئیں۔",
    benefitAmount: null,
    benefitAmountLabel:
      "Subsidy is fixed per phase and no current phase is open — Phase-III was reported at Rs 500,000 per tractor against a farmer share of Rs 500,000",
    benefits: [
      "Large upfront subsidy on a new, locally manufactured tractor",
      "Choice of approved brands (Massey Ferguson, New Holland, Al-Ghazi, Millat)",
      "Transparent computerised balloting rather than discretionary allocation",
    ],
    eligibility: [
      "Permanent resident of Punjab with a valid CNIC",
      "Verified ownership of agricultural land — Phase-III required 5 acres or more (earlier phases allowed 1 to 50 acres)",
      "Tractor selected must be locally manufactured; Phase-III limited the choice to 50–65 HP",
      "Must not have received a subsidised tractor under Phase-I or Phase-II, or under the Wheat Incentive Programme",
      "Must not be a defaulter on a Kisan Card facility",
      "Tractor must stay registered in the applicant's name for at least three years",
    ],
    eligibilityRules: {
      provinces: ["Punjab"],
      landSizeAcres: { min: 5 },
      tenure: ["owner", "owner-cum-tenant"],
      requiresLandRecord: true,
      requiresCnic: true,
      disqualifiers: [
        "Already received a tractor under Green Tractor Phase-I or Phase-II",
        "Benefited from the Wheat Incentive Programme",
        "Default on a Kisan Card facility",
      ],
      notes: ["The minimum land requirement has changed between phases — check the criteria published for the current phase."],
    },
    documents: [
      "Valid CNIC",
      "Punjab domicile / proof of permanent residence",
      "Land ownership record (fard) verifiable through revenue records",
      "Bank deposit slip for the farmer's share once selected in the ballot",
    ],
    howToApply:
      "Register online at gts.punjab.gov.pk during an open phase. The Agriculture Department verifies land ownership through revenue records, then selects beneficiaries by computerised balloting; selected farmers deposit their share within the notified deadline.",
    applicationWindow:
      "Phase-III: 6 – 31 January 2026 (closed). The official portal states it is not accepting new applications. No Phase-IV has been notified — watch gts.punjab.gov.pk.",
    officialUrl: "https://gts.punjab.gov.pk/",
    implementingAgency: "Punjab Agriculture Department",
    helpline: "0800-17000",
    status: "closed",
    featured: true,
    tags: ["tractor", "machinery", "subsidy", "balloting", "punjab"],
    lastVerified: "2026-07-25",
    sources: [
      "https://gts.punjab.gov.pk/",
      "https://punjab.gov.pk/cm-green-tractors-scheme",
      "https://www.app.com.pk/national/eligibility-criteria-set-for-cm-punjab-green-tractor-scheme-phase-iii/",
      "https://www.nation.com.pk/22-Feb-2026/punjab-cm-maryam-nawaz-launches-phase-iii-green-tractor-program",
    ],
    caveats: [
      "There is no single subsidy figure for this scheme, so none is shown. The Rs 1,000,000 on the Punjab Portal describes the original 2024 round (that page still shows a 10 October 2024 deadline and a 50–85 HP range). Phase-III was reported at Rs 500,000 per tractor. Treat any amount as phase-specific until the next phase's criteria are notified.",
      "Beware of lookalike sites. A search for this scheme returns numerous unofficial domains — cmgreentractor.online, gtss.org.pk and similar — advertising an open \"Phase IV\" with subsidies of Rs 700,000 to Rs 1,500,000. No government source or established newspaper confirms a Phase IV, and the official portal shows only Phase-III as closed. Apply nowhere except gts.punjab.gov.pk.",
      "Roughly 34,000 tractors have been distributed across the first three phases against a three-year target of 50,000 (The Nation, 1 July 2026), so a further phase is plausible — but it has not been announced.",
    ],
  },

  {
    id: "apna-khet-apna-rozgar",
    name: "Apna Khet Apna Rozgar",
    nameUr: "اپنا کھیت اپنا روزگار",
    province: "Punjab",
    provincesCovered: ["Punjab"],
    category: "land",
    description:
      "State-owned agricultural land allotted to landless and unemployed Punjabis so they can farm for themselves. A successful household receives up to 5 acres — one lot per family — on a 10-year lease that is extendable by a further 10 years, together with Kisan Card access to subsidised inputs, interest-free credit and technical assistance for high-value cropping. Round 1 offered 124,363 acres across all 36 districts, plus a separate Cholistan pool of about 83,000 acres. It was heavily oversubscribed: roughly 190,000 people applied for about 30,500 available plots.",
    descriptionUr:
      "بے زمین اور بے روزگار افراد کو سرکاری زرعی اراضی مشروط لیز پر دی جاتی ہے تاکہ وہ خود کاشتکاری کر سکیں۔ ایک خاندان کو زیادہ سے زیادہ 5 ایکڑ، دس سالہ لیز پر (جو مزید دس سال بڑھائی جا سکتی ہے)۔ ساتھ میں کسان کارڈ کے ذریعے سستے زرعی اجزاء، بلاسود قرض اور تکنیکی رہنمائی بھی فراہم کی جاتی ہے۔",
    benefitAmount: null,
    benefitAmountLabel:
      "Allotment of up to 5 acres of state agricultural land per household on a 10-year renewable lease, plus input and credit support — no cash grant",
    benefits: [
      "Up to 5 acres of state agricultural land, one lot per family, on a 10-year lease extendable by another 10 years",
      "Kisan Card access to subsidised seed, fertiliser and pesticide",
      "Interest-free production loans",
      "Technical assistance for high-value crops and modern practices",
    ],
    eligibility: [
      "Permanent resident of Punjab with a valid CNIC",
      "Landless, or owning no more than a small residential plot (reported ceiling: 10 marla)",
      "Proxy Means Test (PMT) score of 32 or below",
      "Permanent resident of the same revenue estate in which the state land is located",
      "Targeted at rural youth, landless tenants and very small farmers",
    ],
    eligibilityRules: {
      provinces: ["Punjab"],
      landSizeAcres: {
        max: 0.1,
        label: "you must not own agricultural land — a residential plot of up to about 10 marla (0.06 acre) is allowed",
      },
      tenure: ["landless", "tenant", "sharecropper"],
      requiresCnic: true,
      notes: [
        "This scheme is for people who do not own agricultural land. A residential plot of up to about 10 marla (0.06 acre) does not disqualify you.",
        "You must belong to the revenue estate where the state land lies.",
      ],
    },
    documents: [
      "Valid CNIC",
      "Proof of permanent residence in the relevant revenue estate",
      "Affidavit of landlessness / declaration of existing property",
    ],
    howToApply:
      "Apply online at akar.pulse.gop.pk when a round is open. Applications are screened by district committees against revenue records before allotment.",
    applicationWindow:
      "Round 1: 2 – 18 May 2026 (closed). Final list issued 19 June 2026, distribution began 30 June 2026, balloting results published around 6 July 2026. No Round 2 has opened.",
    officialUrl: "https://punjab.gov.pk/apna-khet",
    implementingAgency: "Government of the Punjab (Board of Revenue and Agriculture Department)",
    status: "closed",
    featured: false,
    tags: ["land", "landless", "lease", "youth", "punjab"],
    lastVerified: "2026-07-25",
    sources: [
      "https://punjab.gov.pk/apna-khet",
      "https://www.dawn.com/news/1999307/situationer-punjab-set-to-launch-land-lease-scheme-amid-concerns",
      "https://www.radio.gov.pk/23-04-2026/punjab-cm-inaugurates-portal-apna-khet-apna-rozgar-scheme",
      "https://www.app.com.pk/punjab/over-16000-applications-received-for-apna-khet-apna-rozgar-program-in-multan/",
    ],
    caveats: [
      "Round 1 was oversubscribed roughly six to one — about 190,000 applications against some 30,500 plots. Being eligible is not the same as being selected; allotment is by computerised ballot.",
      "The lease rent and the per-acre development grant reported in the press are not published on the Punjab Portal, so no figure is stated here. Ask your district Revenue office (Board of Revenue) for the notified rate before you budget around it.",
      "Apply only through akar.pulse.gop.pk or punjab.gov.pk/apna-khet. Third-party sites using the scheme's name — akarpunjabgovt.pk among them — are not run by the government and cannot register you.",
    ],
  },

  {
    id: "punjab-solar-tubewell-programme",
    name: "CM Punjab Solarisation of Agricultural Tubewells",
    nameUr: "وزیراعلیٰ پنجاب زرعی ٹیوب ویل سولرائزیشن پروگرام",
    province: "Punjab",
    provincesCovered: ["Punjab"],
    category: "energy",
    description:
      "A grant that converts an existing diesel or electric agricultural tubewell to solar power, cutting the largest running cost on most Punjab farms. The government publishes the grant by system size: Rs 500,000 for a 10 kW system, Rs 750,000 for 15 kW and Rs 1,000,000 for 20 kW. Phase 1 targets 8,000 tubewells and drew over 450,000 applications. The application window closed on 6 January 2025 and the portal is not taking new applications; installations for selected farmers continue.",
    descriptionUr:
      "موجودہ ڈیزل یا بجلی والے زرعی ٹیوب ویل کو شمسی توانائی پر منتقل کرنے کے لیے گرانٹ، جس سے فارم کا سب سے بڑا خرچ کم ہوتا ہے۔ 10 کلوواٹ کے لیے 5 لاکھ، 15 کلوواٹ کے لیے 7 لاکھ 50 ہزار اور 20 کلوواٹ کے لیے 10 لاکھ روپے۔",
    benefitAmount: 1000000,
    benefitAmountLabel: "Rs 500,000 (10 kW), Rs 750,000 (15 kW) or Rs 1,000,000 (20 kW) per tubewell",
    benefits: [
      "Removes the diesel or electricity bill on the tubewell",
      "Grant scaled to the system size the farm actually needs",
      "Reduces exposure to load-shedding during critical irrigations",
    ],
    eligibility: [
      "Punjab resident with a valid CNIC",
      "Owns at least 1 acre of land in the district where the tubewell is installed",
      "Has a working electric tubewell (3-phase connection, current bill paid, connection installed on or before 30 October 2024) or a diesel tubewell",
      "One solar system per family",
    ],
    eligibilityRules: {
      provinces: ["Punjab"],
      landSizeAcres: { min: 1 },
      tenure: ["owner", "owner-cum-tenant"],
      requiresLandRecord: true,
      requiresCnic: true,
      disqualifiers: ["A family member has already received a system under this programme"],
      notes: ["You must already have a functioning tubewell — this programme converts existing tubewells, it does not install new ones."],
    },
    documents: [
      "Valid CNIC",
      "Land ownership record (fard)",
      "Latest paid electricity bill for the tubewell, or proof of a diesel tubewell",
      "Mobile number registered on the applicant's CNIC",
    ],
    howToApply:
      "Applications are currently closed. When a window reopens, apply online at cmstp.punjab.gov.pk or submit the form from agripunjab.gov.pk to your district Agriculture office. Helpline 0800-17000, 8am–8pm.",
    applicationWindow:
      "Phase 1 closed on 6 January 2025 — the portal states it is not accepting new applications. Over 450,000 applications were received against a target of 8,000 tubewells.",
    officialUrl: "https://cmstp.punjab.gov.pk/",
    implementingAgency: "Punjab Agriculture Department with the Punjab Energy Department",
    helpline: "0800-17000",
    status: "closed",
    featured: true,
    tags: ["solar", "tubewell", "irrigation", "energy", "subsidy", "punjab"],
    lastVerified: "2026-07-25",
    sources: [
      "https://smu.punjab.gov.pk/cm-program-for-solarization-of-tube-well",
      "https://cmstp.punjab.gov.pk/Eligibility-Criteria",
      "https://cmstp.punjab.gov.pk/",
      "https://www.dawn.com/news/1908108",
      "https://www.nation.com.pk/16-May-2025/cm-announces-up-to-95pc-subsidy-on-solarisation-of-agri-tubewells",
    ],
    caveats: [
      "This scheme is listed as closed because the official portal says so in as many words: applications shut on 6 January 2025. The grant amounts remain published and the programme is still being implemented for farmers already selected — but you cannot apply today.",
      "Rollout has been slow. Dawn reported in May 2025 that the programme stalled after responsibility moved from the Water Management Wing to the Punjab Energy Department, with vendor disputes unresolved. Over 450,000 farmers applied for 8,000 systems, so selection was always going to be a small fraction of applicants.",
      "The Chief Minister announced a subsidy of \"up to 95%\" in May 2025. No source ties that percentage to the fixed Rs 500,000 / 750,000 / 1,000,000 grants, and it is unclear whether it replaces or restates them. The fixed amounts above are the ones actually published by the government today.",
      "Several unofficial sites advertise a Phase 2 launching in 2026. No government source or established newspaper confirms one, and the official portal still shows the Phase 1 closure notice.",
    ],
  },

  {
    id: "benazir-hari-card",
    name: "Benazir Hari Card",
    nameUr: "بینظیر ہاری کارڈ",
    province: "Sindh",
    provincesCovered: ["Sindh"],
    category: "financial-assistance",
    description:
      "Sindh's registration card for growers, issued through Sindh Bank. It is the gateway to provincial support: subsidies on seed, fertiliser, pesticide and farm machinery, crop insurance, interest-free loans, and relief payments when a natural calamity destroys a crop. Registration is open online so farmers do not have to visit a government office.",
    descriptionUr:
      "سندھ حکومت کا کاشتکاروں کے لیے رجسٹریشن کارڈ، جو سندھ بینک کے ذریعے جاری ہوتا ہے۔ اس کے ذریعے بیج، کھاد، زرعی ادویات اور مشینری پر سبسڈی، فصل بیمہ، بلاسود قرض اور قدرتی آفات میں امداد حاصل کی جا سکتی ہے۔",
    benefitAmount: null,
    benefitAmountLabel: "Access to input subsidies, crop insurance, interest-free loans and disaster relief — the cash value depends on the support being claimed",
    benefits: [
      "Subsidies on seed, fertiliser and pesticide",
      "Access to subsidised farm machinery",
      "Crop insurance cover",
      "Interest-free loans through Sindh Bank",
      "Financial assistance after floods and other notified calamities",
    ],
    eligibility: [
      "Agricultural landholder in Sindh with a valid CNIC",
      "Land record verified by the revenue department (Form VII)",
      "One card per owner, covering the cumulative holding across all their land",
      "For jointly owned land, only one owner may register, with a no-objection affidavit from the other co-owners or heirs",
      "Smallholders are given preference",
    ],
    eligibilityRules: {
      provinces: ["Sindh"],
      tenure: ["owner", "owner-cum-tenant"],
      requiresLandRecord: true,
      requiresCnic: true,
      notes: [
        "All agricultural landholders in Sindh can register regardless of holding size, but smallholders are prioritised for the support that follows.",
      ],
    },
    documents: [
      "Valid CNIC",
      "Form VII (revenue land record) verified by the revenue department",
      "Mobile number registered on the applicant's CNIC",
      "No-objection affidavit from co-owners, where the land is jointly held",
    ],
    howToApply:
      "The dedicated registration portal is offline at the time of writing. Register through your district revenue or agriculture office, or the Sindh Agriculture Department at agri.sindh.gov.pk, with your CNIC and Form VII. The card is issued through Sindh Bank once the revenue record is verified.",
    officialUrl: "https://agri.sindh.gov.pk",
    implementingAgency: "Government of Sindh (Agriculture Department) with Sindh Bank",
    status: "active",
    featured: true,
    tags: ["hari card", "sindh", "subsidy", "crop insurance", "interest-free loan"],
    lastVerified: "2026-07-25",
    sources: [
      "https://agri.sindh.gov.pk",
      "https://www.thenews.com.pk/print/1237760-sindh-to-issue-benazir-hari-cards-through-sindh-bank",
      "https://www.brecorder.com/news/40326017/sindh-bank-to-issue-benazir-hari-cards",
      "https://www.dawn.com/news/2008648",
    ],
    caveats: [
      "The scheme's own portal, benazirharicard.gos.pk, returns a 404 error on every public page as of 25 July 2026 — only the staff login responds. The programme itself is running; the citizen-facing website is broken. Go through your district office rather than assuming registration has stopped.",
      "Per-acre cash grant figures circulate widely online but are not published by the Sindh government, so they are deliberately not listed here. Official statements describe payment \"in per-acre slabs\" without ever naming the rate. Ask your district agriculture office what the current entitlement is, and treat any specific figure you read on a blog as unverified.",
      "The Sindh FY2026-27 budget allocates Rs 3 billion to the Hari Card, down from Rs 8 billion the previous year, with 306,709 new cards issued during FY2025-26 (Dawn, 18 June 2026). A smaller pot may mean tighter rationing of the support attached to the card.",
      "Crop insurance and subsidised machinery are described in the programme's announcements but are less consistently documented than the seed, fertiliser and pesticide subsidies. Confirm which components are live before counting on them.",
    ],
  },

  {
    id: "balochistan-tubewell-solarisation",
    name: "Solarisation of Agricultural Tubewells, Balochistan",
    nameUr: "بلوچستان زرعی ٹیوب ویل سولرائزیشن منصوبہ",
    province: "Balochistan",
    provincesCovered: ["Balochistan"],
    category: "energy",
    description:
      "A joint federal and Balochistan programme to convert the province's 27,437 subsidised agricultural tubewells to solar power, at a total cost of about Rs 55 billion shared 70:30 between the federal and provincial governments. The ECC approved a further Rs 24.5 billion on 5 May 2025, on top of an earlier Rs 14 billion. Implementation runs through the Power Division and QESCO rather than through an individual online application.",
    descriptionUr:
      "بلوچستان کے 27,000 زرعی ٹیوب ویلوں کو شمسی توانائی پر منتقل کرنے کا وفاقی و صوبائی مشترکہ منصوبہ، جس کی مجموعی لاگت تقریباً 55 ارب روپے ہے اور وفاق و صوبے کا حصہ 70:30 ہے۔",
    benefitAmount: null,
    benefitAmountLabel: "Government-funded conversion of an existing tubewell to solar — no per-farmer cash grant is published",
    benefits: [
      "Removes the electricity bill and load-shedding risk on an agricultural tubewell",
      "Reduces groundwater pumping cost in Pakistan's most water-scarce province",
      "Fully cost-shared between the federal and provincial governments",
    ],
    eligibility: [
      "Farmer in Balochistan with an existing registered agricultural tubewell connection (QESCO)",
      "Valid CNIC and land ownership record",
      "Allocation is managed by the provincial government and QESCO under the agreed implementation SOPs",
    ],
    eligibilityRules: {
      provinces: ["Balochistan"],
      tenure: ["owner", "owner-cum-tenant"],
      requiresLandRecord: true,
      requiresCnic: true,
      notes: ["There is no public self-service portal — approach QESCO or the Balochistan Agriculture Department."],
    },
    documents: [
      "Valid CNIC",
      "QESCO agricultural tubewell connection / consumer record",
      "Land ownership record",
    ],
    howToApply:
      "Through the Balochistan Agriculture Department or your QESCO regional office. Beneficiary tubewells are identified from QESCO's agricultural connection records under the project SOPs.",
    officialUrl: "https://power.gov.pk/",
    implementingAgency: "Power Division (Government of Pakistan), Government of Balochistan and QESCO",
    status: "active",
    featured: false,
    tags: ["solar", "tubewell", "balochistan", "energy", "qesco"],
    lastVerified: "2026-07-25",
    sources: [
      "https://tribune.com.pk/story/2544220/ecc-approves-solarisation-of-27000-tube-wells",
      "https://propakistani.pk/2025/05/05/ecc-approves-rs-24-5-billion-for-solarization-of-agri-tubewells-in-balochistan/",
      "https://tribune.com.pk/story/2546452/balochistans-tube-well-solarisation-stalls",
      "https://tribune.com.pk/story/2613711/balochistan-unveils-rs1089tr-budget-targets-rs170b-in-revenue",
    ],
    caveats: [
      "Rollout has been slowed by delays in fund utilisation and by the security situation in parts of the province. The ECC's own July 2025 completion target was missed. Confirm the current position with QESCO before making plans around it.",
      "As last reported (July 2025), about Rs 26.85 billion had reached 13,400-plus farmers across three phases, with more than Rs 28 billion still unreleased. Balochistan's FY2026-27 budget adds a further Rs 3.8 billion, so the project is alive but moving slowly.",
      "Farmers have complained of damaged tubewell motors after conversion, and the programme covers electric (QESCO-connected) tubewells — owners of non-electric wells have reported being excluded.",
    ],
  },

  {
    id: "sbp-zarkhez-e-nsfsi",
    name: "Zarkhez-e — National Subsistence Farmers Support Initiative",
    nameUr: "زرخیز اِی — آسان ڈیجیٹل زرعی قرضہ",
    province: "Federal",
    provincesCovered: [
      "Punjab",
      "Sindh",
      "Khyber Pakhtunkhwa",
      "Balochistan",
      "Azad Jammu & Kashmir",
      "Gilgit-Baltistan",
      "Islamabad Capital Territory",
    ],
    category: "credit",
    description:
      "The State Bank of Pakistan's collateral-free digital production loan for subsistence farmers, launched on 14 October 2025 and branded \"Asaan Digital Zarai Qarza\". Financing is Rs 100,000 per acre, capped at Rs 1,000,000 for landowners and Rs 500,000 for tenants. Three quarters is disbursed in kind — seed, fertiliser, pesticide and diesel through registered agri merchants — and up to a quarter in cash for other farming costs. Life and crop insurance are built in.",
    descriptionUr:
      "اسٹیٹ بینک آف پاکستان کا بغیر ضمانت ڈیجیٹل زرعی قرضہ، جو چھوٹے کاشتکاروں کے لیے ہے۔ فی ایکڑ ایک لاکھ روپے، زمیندار کے لیے زیادہ سے زیادہ دس لاکھ اور مزارع کے لیے پانچ لاکھ روپے۔ 75 فیصد رقم بیج، کھاد، ادویات اور ڈیزل کی صورت میں دی جاتی ہے۔",
    benefitAmount: 1000000,
    benefitAmountLabel:
      "Rs 100,000 per acre — up to Rs 1,000,000 for landowners and Rs 500,000 for tenants, with no collateral",
    benefits: [
      "No collateral required",
      "Fully digital — apply from the portal without visiting a bank branch",
      "Verified against the Land Information Management System (LIMS), so approval does not depend on a bank visit",
      "75% disbursed in kind through registered agri merchants, up to 25% in cash",
      "Mandatory life and crop insurance for qualifying borrowers",
      "Open to tenants, not just landowners",
    ],
    eligibility: [
      "Subsistence farmer with a valid CNIC",
      "Holding up to 12.5 acres in Punjab and Khyber Pakhtunkhwa, 16 acres in Sindh, or 32 acres in Balochistan",
      "Landowners and tenants both eligible (tenants at the lower cap)",
      "Land or tenancy verifiable through LIMS",
    ],
    eligibilityRules: {
      provinces: "all",
      landSizeAcres: { max: 12.5 },
      landSizeByProvince: {
        Punjab: { max: 12.5 },
        "Khyber Pakhtunkhwa": { max: 12.5 },
        Sindh: { max: 16 },
        Balochistan: { max: 32 },
      },
      tenure: ["owner", "owner-cum-tenant", "tenant"],
      requiresCnic: true,
      notes: [
        "The subsistence-holding ceiling differs by province: 12.5 acres in Punjab and KPK, 16 in Sindh, 32 in Balochistan.",
        "Tenants are capped at Rs 500,000 rather than Rs 1,000,000.",
      ],
    },
    documents: [
      "Valid CNIC",
      "Land record verifiable through LIMS, or tenancy proof for tenants",
      "Mobile number registered on the applicant's CNIC",
      "Bank account with a participating bank or microfinance bank",
    ],
    howToApply:
      "Apply on the Zarkhez-e portal at nsfsi.pitb.gov.pk (there is also an Android app) without visiting a branch. The application is verified through LIMS and then routed to the bank or microfinance bank you choose.",
    officialUrl: "https://nsfsi.pitb.gov.pk/",
    implementingAgency: "State Bank of Pakistan (Agricultural Credit and Microfinance Department) with participating banks",
    status: "active",
    featured: true,
    tags: ["collateral-free", "digital loan", "subsistence farmer", "tenant", "nationwide", "sbp"],
    lastVerified: "2026-07-25",
    sources: [
      "https://nsfsi.pitb.gov.pk/",
      "https://www.sbp.org.pk/circulars/acfid-circular-letter-no-01-of-2025",
      "https://www.app.com.pk/business/sbp-launches-collateral-free-digital-financing-scheme-for-small-farmers-to-uplift-agriculture/",
      "https://profit.pakistantoday.com.pk/2025/10/14/sbp-launches-zarkhez-e-digital-scheme-to-provide-collateral-free-agri-loans-for-small-farmers/",
    ],
    caveats: [
      "Not every bank has completed its integration with the scheme. Ask your bank whether it is live on Zarkhez-e before counting on it for the coming season.",
      "The application portal is run by the Punjab IT Board on a federal scheme, which is why its address is nsfsi.pitb.gov.pk rather than an SBP domain. It is the genuine portal — the SBP's own initiatives page links to it.",
    ],
  },

  {
    id: "ztbl-agriculture-loans",
    name: "ZTBL Agriculture Loans",
    nameUr: "زرعی ترقیاتی بینک کے زرعی قرضے",
    province: "Federal",
    provincesCovered: [
      "Punjab",
      "Sindh",
      "Khyber Pakhtunkhwa",
      "Balochistan",
      "Azad Jammu & Kashmir",
      "Gilgit-Baltistan",
      "Islamabad Capital Territory",
    ],
    category: "credit",
    description:
      "Zarai Taraqiati Bank Limited is Pakistan's state-owned agricultural development bank and the largest public-sector agricultural lender, with branches nationwide. It offers production loans (the Kissan Khushhal Scheme, the Zarkhez-e digital loan and electronic warehouse-receipt financing for rice and maize) and development loans (tractors, high-efficiency irrigation, dairy value chain, poultry and beekeeping). It also channels the Government mark-up subsidy and risk-sharing schemes for small farmers. The bank is currently going through a privatisation process.",
    descriptionUr:
      "زرعی ترقیاتی بینک لمیٹڈ پاکستان کا سرکاری زرعی ترقیاتی بینک ہے جس کی شاخیں پورے ملک میں ہیں۔ یہ فصل کے قرضے اور ترقیاتی قرضے (ٹریکٹر، آبپاشی کے جدید نظام، ڈیری، پولٹری، شہد کی مکھیاں) فراہم کرتا ہے۔ اس وقت بینک کی نجکاری کا عمل جاری ہے۔",
    benefitAmount: null,
    benefitAmountLabel: "Loan limits are set case by case from the farm's production plan and the security offered",
    benefits: [
      "Production loans for seasonal inputs",
      "Development loans for tractors, irrigation systems, dairy, poultry and beekeeping",
      "Electronic warehouse-receipt financing so you can store grain instead of selling into a low market",
      "Government mark-up subsidy and risk-sharing schemes for small farmers",
      "Branch network reaching all four provinces plus AJK and Gilgit-Baltistan",
    ],
    eligibility: [
      "Pakistani farmer aged 18 or over with a valid CNIC",
      "Owner, owner-cum-tenant or tenant cultivator",
      "Land passbook / revenue record, or other acceptable security depending on the loan product",
      "Clean credit history (checked through eCIB)",
    ],
    eligibilityRules: {
      provinces: "all",
      tenure: ["owner", "owner-cum-tenant", "tenant", "sharecropper"],
      requiresCnic: true,
      disqualifiers: ["Existing default recorded in eCIB"],
      notes: ["Security requirements differ between production loans and development loans — ask the branch which applies."],
    },
    documents: [
      "Valid CNIC",
      "Land record / passbook, or tenancy agreement for tenant cultivators",
      "Two recent photographs",
      "Security documents for development loans",
    ],
    howToApply:
      "Visit the nearest ZTBL branch with your CNIC and land record, or start through ZTBL's digital channels. The branch mobile credit officer prepares the production plan that sets your limit. Helpline 051-111-30-30-30.",
    officialUrl: "https://ztbl.com.pk/agriculture-loans/",
    implementingAgency: "Zarai Taraqiati Bank Limited (ZTBL)",
    helpline: "051-111-30-30-30",
    status: "active",
    featured: false,
    tags: ["ztbl", "loan", "tractor loan", "development loan", "nationwide"],
    lastVerified: "2026-07-25",
    sources: [
      "https://ztbl.com.pk/agriculture-loans/",
      "https://ztbl.com.pk/agri-loan/markup-subsidy-and-risk-sharing-scheme/",
      "https://ztbl.com.pk/agri-loan/gop-markup-subsidy-scheme-gmss/",
      "https://www.brecorder.com/news/40418950",
      "https://www.nation.com.pk/30-Apr-2026/pc-board-makes-key-recommendations-ztbl-privatisation",
    ],
    caveats: [
      "ZTBL does not publish a single mark-up rate or loan ceiling that applies to every product. Ask the branch for the current rate sheet in writing before signing.",
      "ZTBL is being privatised. The Privatisation Commission Board endorsed a transaction structure and restructuring plan on 29 April 2026 and referred it to the Cabinet Committee on Privatisation; expressions of interest from buyers follow approval. Branches are operating normally today, but terms, products and the branch network could change once a sale completes. Get any long-term commitment in writing.",
    ],
  },

  {
    id: "crop-loan-insurance-scheme",
    name: "Crop Loan Insurance Scheme (CLIS / CLIS+)",
    nameUr: "فصلی قرضہ بیمہ سکیم",
    province: "Federal",
    provincesCovered: [
      "Punjab",
      "Sindh",
      "Khyber Pakhtunkhwa",
      "Balochistan",
      "Azad Jammu & Kashmir",
      "Gilgit-Baltistan",
      "Islamabad Capital Territory",
    ],
    category: "insurance",
    description:
      "Insurance attached to a bank production loan, so a calamity does not leave you owing the bank for a crop you never harvested. Under CLIS the premium is 1.3% of the sanctioned loan per season (Rabi and Kharif separately), paid by the bank and reimbursed by the government for subsistence farmers holding up to 25 acres, with a maximum insured loan of Rs 500,000 per case. In April 2026 the State Bank launched CLIS+, which makes cover mandatory on all production loans, adds potato to the covered crops, and adds one-time income support and personal accident cover.",
    descriptionUr:
      "بینک کے فصلی قرضے کے ساتھ منسلک بیمہ، تاکہ قدرتی آفت کی صورت میں کسان پر قرض کا بوجھ نہ رہے۔ پریمیم قرضے کا 1.3 فیصد فی موسم ہے، جو چھوٹے کاشتکاروں (25 ایکڑ تک) کے لیے حکومت ادا کرتی ہے۔",
    benefitAmount: 500000,
    benefitAmountLabel: "Loan cover up to Rs 500,000 per case; premium of 1.3% per season paid by the government for subsistence farmers",
    benefits: [
      "Your production loan is written off by the insurer if the crop fails in a calamity-notified area",
      "Premium paid by the government for subsistence farmers holding up to 25 acres (32 acres in Balochistan)",
      "Covers excessive rain, flood, drought, hailstorm, frost, locust attack and insect attack",
      "Covers wheat, cotton, sugarcane, rice and maize (CLIS+ adds potato)",
      "CLIS+ adds one-time income support of Rs 15,000 for male and Rs 17,500 for female farmers in affected areas",
      "CLIS+ adds personal accident cover up to Rs 250,000 for male and Rs 275,000 for female farmers",
      "CLIS+ requires banks to file claims within 15 working days and insurers to settle within 30",
    ],
    eligibility: [
      "Any farmer taking a production loan from a participating bank",
      "Cover runs from sowing or transplanting until harvest is complete",
      "Premium subsidy applies to subsistence farmers cultivating up to 25 acres, or up to 32 acres in Balochistan",
      "Full compensation is paid where the loss occurs in an area the government has notified as calamity-hit",
    ],
    eligibilityRules: {
      provinces: "all",
      // Deliberately NO landSizeAcres rule. The 25-acre figure is the ceiling
      // for the *government-paid premium*, not for the cover — a larger farmer
      // is still eligible, they just pay the premium themselves. Encoding it as
      // a holding limit made the matcher tell 26-acre farmers they could not be
      // insured, contradicting this scheme's own eligibility bullets.
      tenure: ["owner", "owner-cum-tenant", "tenant", "sharecropper"],
      requiresCnic: true,
      notes: [
        "Any farmer taking a production loan from a participating bank is covered, whatever the holding size.",
        "The government pays the premium only for subsistence farmers cultivating up to 25 acres (32 acres in Balochistan). Above that you are still insured, but the 1.3% premium comes out of your own pocket.",
        "Under CLIS+ the cover is mandatory on all production loans, collateralised or not.",
      ],
    },
    documents: [
      "Handled by the lending bank as part of the loan file",
      "Valid CNIC",
      "Land or tenancy record used for the loan",
    ],
    howToApply:
      "There is no separate application — the cover attaches to your production loan. Ask your bank for the CLIS/CLIS+ policy document and keep it, and report a loss to the bank immediately once your area is notified as calamity-hit.",
    officialUrl: "https://ztbl.com.pk/agri-loan/crop-insurance-scheme/",
    implementingAgency: "State Bank of Pakistan with participating banks and insurers",
    status: "active",
    featured: true,
    tags: ["crop insurance", "clis", "flood", "drought", "nationwide", "sbp"],
    lastVerified: "2026-07-25",
    sources: [
      "https://ztbl.com.pk/agri-loan/crop-insurance-scheme/",
      "https://pkrevenue.com/sbp-launches-crop-loan-insurance-scheme-plus-clis-to-strengthen-farmer-protection/",
      "https://www.brecorder.com/news/amp/40429286",
    ],
    caveats: [
      "Compensation depends on the government formally notifying your area as calamity-hit. Insurance on the loan is not the same as insurance on your whole crop or your expected profit.",
      "The base CLIS terms above — the 1.3% premium, the Rs 500,000 cap, the five covered crops and the list of perils — are published by ZTBL as an implementing bank and were confirmed there. The CLIS+ figures (income support, personal accident cover, claim deadlines) come from financial-press reporting of the April 2026 launch; the underlying State Bank circular could not be located on sbp.org.pk. Treat the CLIS+ amounts as well-reported rather than officially confirmed, and ask your bank for the policy document.",
      "The State Bank's own CLIS pages — sbp.org.pk/Incen-others/Agri-1.asp and the CLIS.pdf beneath it — now return the generic SBP homepage instead of the scheme content, despite responding with HTTP 200. They are dead links dressed up as working ones, which is why they are no longer cited here.",
    ],
  },
]

/* ----------------------------------------------------------------- helpers */

export const SCHEME_CATEGORIES: Array<{ id: SchemeCategory; name: string; nameUr: string }> = [
  { id: "credit", name: "Loans & Credit", nameUr: "قرضے" },
  { id: "subsidy", name: "Input Subsidy", nameUr: "زرعی اجزاء پر سبسڈی" },
  { id: "insurance", name: "Crop Insurance", nameUr: "فصل بیمہ" },
  { id: "mechanisation", name: "Machinery", nameUr: "مشینری" },
  { id: "energy", name: "Solar & Energy", nameUr: "شمسی توانائی" },
  { id: "land", name: "Land Allotment", nameUr: "اراضی کی الاٹمنٹ" },
  { id: "financial-assistance", name: "Financial Assistance", nameUr: "مالی معاونت" },
]

export const SCHEME_PROVINCES: Array<{ id: SchemeProvince; name: string; nameUr: string }> = [
  { id: "Federal", name: "Federal (nationwide)", nameUr: "وفاقی (ملک بھر)" },
  { id: "Punjab", name: "Punjab", nameUr: "پنجاب" },
  { id: "Sindh", name: "Sindh", nameUr: "سندھ" },
  { id: "KPK", name: "Khyber Pakhtunkhwa", nameUr: "خیبر پختونخوا" },
  { id: "Balochistan", name: "Balochistan", nameUr: "بلوچستان" },
]

/** Maps the canonical User `state` value onto the short scheme-province label. */
export const PROVINCE_LABEL: Record<CoveredProvince, SchemeProvince | null> = {
  Punjab: "Punjab",
  Sindh: "Sindh",
  "Khyber Pakhtunkhwa": "KPK",
  Balochistan: "Balochistan",
  "Azad Jammu & Kashmir": null,
  "Gilgit-Baltistan": null,
  "Islamabad Capital Territory": null,
}

const BY_ID = new Map(PAKISTAN_SCHEMES.map((scheme) => [scheme.id, scheme]))

export function findScheme(id: string): Scheme | null {
  if (!id) return null
  const key = decodeURIComponent(id).trim().toLowerCase()
  return BY_ID.get(key) ?? PAKISTAN_SCHEMES.find((s) => s.name.toLowerCase() === key) ?? null
}

/** True when a scheme is open to farmers in the given canonical province. */
export function coversProvince(scheme: Scheme, province: CoveredProvince): boolean {
  return scheme.provincesCovered.includes(province)
}

/**
 * Honest note for provinces with no province-specific scheme in this dataset.
 * AJK, Gilgit-Baltistan, ICT and KPK farmers are served by the federal schemes;
 * we say so rather than showing them an empty page.
 */
export const COVERAGE_NOTE =
  "This list carries the federal schemes (open nationwide) plus the provincial schemes we could verify against an official source — currently Punjab, Sindh and Balochistan. Khyber Pakhtunkhwa, AJK, Gilgit-Baltistan and Islamabad farmers are covered by the federal schemes listed here; also check your own provincial agriculture department for local programmes."

export default PAKISTAN_SCHEMES
