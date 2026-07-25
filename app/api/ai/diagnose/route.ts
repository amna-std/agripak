/**
 * POST /api/ai/diagnose — crop disease detection from a photograph.
 *
 * The flagship AI feature. A farmer uploads a photo of a sick plant; Gemini
 * vision reads it against a hand-written Pakistani plant-clinic prompt
 * (`lib/prompts/diagnosis.ts`) and returns a structured diagnosis.
 *
 * Accepts either:
 *   - JSON:      { image | imageBase64 | images[], mimeType?, crop?, description?, ... }
 *                where each image is a `data:` URL or bare base64; or
 *   - multipart: form fields `image`/`file`/`photo` plus the same text fields.
 *
 * Never 500s on a badly-shaped model answer: if the JSON cannot be parsed the
 * raw analysis text is returned with `parsed: false` so the UI can still show
 * something useful.
 *
 * Auth is optional. Signed-in farmers get the diagnosis saved to
 * `CropDiagnosis` so it appears in their history.
 */

import { connectDB } from "@/lib/db"
import { ok, fail, handler, readJson } from "@/lib/api-helpers"
import CropDiagnosis from "@/lib/models/CropDiagnosis"
import { extractJson, generateFromImages, type InlineImage } from "@/lib/services/geminiService"
import { buildDiagnosisSystemPrompt, buildDiagnosisUserPrompt } from "@/lib/prompts"
import { aiFailure, cleanText, optionalAuth, requireGemini, resolveLanguage, toFarmerProfile } from "../_shared"

export const dynamic = "force-dynamic"
// Runtime budget: vision plus a thinking budget is the slowest call in the app.
// `vercel.json` grants `app/api/ai/**` a 60s maxDuration, well above Vercel's ~10s
// default; without that grant this route would be killed mid-diagnosis.

/**
 * Vercel caps a serverless function's REQUEST BODY at 4.5 MB, and base64 inflates
 * a photo by ~33%, so anything over ~3.3 MB of image never reaches this handler —
 * the platform rejects it with an opaque 413 first. We therefore cap below that
 * and say so, instead of advertising a 6 MB limit we cannot actually honour.
 */
const MAX_IMAGE_BYTES = 3 * 1024 * 1024
/** Total decoded bytes across all images, for the same reason. */
const MAX_TOTAL_IMAGE_BYTES = 3 * 1024 * 1024
const TOO_LARGE_MESSAGE =
  "That photo is too large to upload. Please send a photo under 3 MB — on most phones, choosing a smaller size or cropping to the affected leaf is enough."
const MAX_IMAGES = 3
/** Large: the diagnosis JSON is long and the model also spends tokens thinking. */
const MAX_OUTPUT_TOKENS = 5120

const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]

/* -------------------------------------------------------------------------
 * Image intake
 * ---------------------------------------------------------------------- */

/** Reads the mime type from a base64 payload's magic prefix. */
function sniffMime(base64: string): string {
  if (base64.startsWith("/9j/")) return "image/jpeg"
  if (base64.startsWith("iVBORw0KGgo")) return "image/png"
  if (base64.startsWith("R0lGOD")) return "image/gif"
  if (base64.startsWith("UklGR")) return "image/webp"
  return "image/jpeg"
}

type ImageResult = { image: InlineImage } | { error: string }

function parseImagePayload(value: unknown, fallbackMime?: string): ImageResult {
  if (typeof value !== "string" || !value.trim()) return { error: "Empty image payload." }

  let raw = value.trim()
  let mimeType = fallbackMime

  const dataUrl = raw.match(/^data:([a-zA-Z0-9.+/-]+);base64,([\s\S]*)$/)
  if (dataUrl) {
    mimeType = dataUrl[1].toLowerCase()
    raw = dataUrl[2]
  }

  const data = raw.replace(/\s+/g, "")
  if (!data) return { error: "Empty image payload." }
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(data)) {
    return { error: "The image is not valid base64 data." }
  }

  const bytes = Math.floor((data.length * 3) / 4)
  if (bytes > MAX_IMAGE_BYTES) {
    return { error: TOO_LARGE_MESSAGE }
  }
  if (bytes < 1024) {
    return { error: "That photo is too small to read. Please send a clearer picture." }
  }

  const finalMime = (mimeType || sniffMime(data)).toLowerCase()
  if (!ALLOWED_MIME.includes(finalMime)) {
    return { error: `Unsupported image type "${finalMime}". Please send a JPG, PNG or WEBP photo.` }
  }

  return { image: { data, mimeType: finalMime } }
}

interface Intake {
  images: InlineImage[]
  fields: Record<string, string>
  error?: string
}

async function readIntake(req: Request): Promise<Intake> {
  const contentType = req.headers.get("content-type") || ""
  const fields: Record<string, string> = {}
  const images: InlineImage[] = []

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData()
    for (const [key, value] of form.entries()) {
      if (typeof value === "string") {
        fields[key] = value
        continue
      }
      if (images.length >= MAX_IMAGES) continue
      const blob = value as File
      if (blob.size > MAX_IMAGE_BYTES) {
        return { images: [], fields, error: TOO_LARGE_MESSAGE }
      }
      const mimeType = (blob.type || "image/jpeg").toLowerCase()
      if (!ALLOWED_MIME.includes(mimeType)) {
        return {
          images: [],
          fields,
          error: `Unsupported image type "${mimeType}". Please send a JPG, PNG or WEBP photo.`,
        }
      }
      const buffer = Buffer.from(await blob.arrayBuffer())
      images.push({ data: buffer.toString("base64"), mimeType })
    }
    return { images, fields }
  }

  const body = await readJson(req)
  for (const [key, value] of Object.entries(body)) {
    if (typeof value === "string") fields[key] = value
    else if (typeof value === "number" || typeof value === "boolean") fields[key] = String(value)
  }

  const candidates: unknown[] = []
  if (Array.isArray(body.images)) candidates.push(...body.images.slice(0, MAX_IMAGES))
  for (const key of ["image", "imageBase64", "photo", "file", "imageUrl"]) {
    if (typeof body[key] === "string") candidates.push(body[key])
  }

  const mimeHint = typeof body.mimeType === "string" ? body.mimeType.toLowerCase() : undefined
  for (const candidate of candidates.slice(0, MAX_IMAGES)) {
    const value = typeof candidate === "object" && candidate ? (candidate as any).data ?? (candidate as any).url : candidate
    const parsed = parseImagePayload(value, mimeHint)
    if ("error" in parsed) return { images: [], fields, error: parsed.error }
    images.push(parsed.image)
  }

  return { images, fields }
}

/* -------------------------------------------------------------------------
 * Response normalisation
 * ---------------------------------------------------------------------- */

const SEVERITIES = ["mild", "moderate", "severe"]
const AREAS = ["leaves", "fruits", "stems", "roots", "whole_plant"]
const CATEGORIES = ["fungal", "bacterial", "viral", "pest", "nutrient_deficiency", "environmental", "healthy", "unknown"]
/** The subset `lib/models/CropDiagnosis` will accept for `aiDiagnosis.disease.category`. */
const STORABLE_CATEGORIES = ["fungal", "bacterial", "viral", "pest", "nutrient_deficiency", "environmental"]

function pick(value: unknown, allowed: string[], fallback: string): string {
  const candidate = String(value ?? "").toLowerCase().trim().replace(/\s+/g, "_")
  return allowed.includes(candidate) ? candidate : fallback
}

function stringList(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return typeof value === "string" && value.trim() ? [value.trim()] : []
  return value
    .map((item) => (typeof item === "string" ? item.trim() : item && typeof item === "object" ? String((item as any).text ?? "") : ""))
    .filter(Boolean)
    .slice(0, max)
}

function clampConfidence(value: unknown): number {
  const num = Number(value)
  if (!Number.isFinite(num)) return 0
  return Math.max(0, Math.min(100, Math.round(num)))
}

/** Shapes the model's JSON into the contract the frontend and the DB rely on. */
function normaliseDiagnosis(parsed: any) {
  const category = pick(parsed?.category, CATEGORIES, "unknown")
  const disease = typeof parsed?.disease === "string" && parsed.disease.trim() ? parsed.disease.trim() : null

  const treatment = (Array.isArray(parsed?.treatment) ? parsed.treatment : [])
    .slice(0, 6)
    .map((step: any, index: number) => {
      if (typeof step === "string") {
        return { step: index + 1, action: step, type: "cultural", product: null, dosage: null, timing: null, estimatedCostPKR: null, safetyNote: null }
      }
      return {
        step: Number(step?.step) || index + 1,
        action: cleanText(step?.action ?? step?.method, 600) || null,
        type: pick(step?.type, ["organic", "chemical", "biological", "cultural"], "cultural"),
        product: cleanText(step?.product, 200) || null,
        dosage: cleanText(step?.dosage, 200) || null,
        timing: cleanText(step?.timing ?? step?.frequency, 200) || null,
        estimatedCostPKR: cleanText(step?.estimatedCostPKR ?? step?.cost, 120) || null,
        safetyNote: cleanText(step?.safetyNote, 600) || null,
      }
    })
    .filter((step: any) => step.action)

  const alternatives = (Array.isArray(parsed?.alternatives) ? parsed.alternatives : [])
    .slice(0, 3)
    .map((alt: any) => ({
      name: cleanText(typeof alt === "string" ? alt : alt?.name, 160),
      category: pick(alt?.category, CATEGORIES, "unknown"),
      confidence: clampConfidence(alt?.confidence),
      howToTell: cleanText(alt?.howToTell, 400) || null,
    }))
    .filter((alt: any) => alt.name)

  return {
    isPlant: parsed?.isPlant !== false,
    imageQuality: pick(parsed?.imageQuality, ["good", "fair", "poor"], "fair"),
    needsBetterPhoto: Boolean(parsed?.needsBetterPhoto),
    cropIdentified: cleanText(parsed?.cropIdentified, 120) || null,
    disease,
    diseaseLocalName: cleanText(parsed?.diseaseLocalName, 160) || null,
    category,
    confidence: clampConfidence(parsed?.confidence),
    severity: pick(parsed?.severity, SEVERITIES, "moderate"),
    affectedArea: pick(parsed?.affectedArea, AREAS, "leaves"),
    spreadRisk: pick(parsed?.spreadRisk, ["low", "medium", "high"], "medium"),
    symptoms: stringList(parsed?.symptoms, 6),
    alternatives,
    treatment,
    prevention: stringList(parsed?.prevention, 6),
    organicOptions: stringList(parsed?.organicOptions, 5),
    whenToConsultExpert:
      cleanText(parsed?.whenToConsultExpert, 600) ||
      "If the problem spreads or does not improve within a week, show an affected plant to the Field Assistant at your tehsil agriculture office.",
    yieldRiskNote: cleanText(parsed?.yieldRiskNote, 400) || null,
    farmerSummary: cleanText(parsed?.farmerSummary, 800) || null,
  }
}

/* -------------------------------------------------------------------------
 * Route
 * ---------------------------------------------------------------------- */

export const POST = handler(async (req: Request) => {
  const notConfigured = requireGemini()
  if (notConfigured) return notConfigured

  const intake = await readIntake(req)
  if (intake.error) return fail(intake.error, 400)
  if (!intake.images.length) {
    return fail("Please attach a photo of the affected plant so it can be examined.", 400)
  }

  // Per-image caps are not enough: three 3 MB photos still blow the platform's
  // request-body limit, so the combined payload is checked too.
  const totalBytes = intake.images.reduce((sum, image) => sum + Math.floor((image.data.length * 3) / 4), 0)
  if (totalBytes > MAX_TOTAL_IMAGE_BYTES) {
    return fail(
      "Those photos are too large together. Please send fewer photos, or smaller ones — 3 MB in total.",
      400,
    )
  }

  const crop = cleanText(intake.fields.crop ?? intake.fields.cropName, 80)
  const description = cleanText(intake.fields.description ?? intake.fields.symptoms ?? intake.fields.notes, 1000)

  const user = await optionalAuth(req)
  const profile = toFarmerProfile(user)

  const province = cleanText(intake.fields.province ?? intake.fields.state, 80) || profile?.province || ""
  const district = cleanText(intake.fields.district, 80) || profile?.district || ""
  const language = resolveLanguage(intake.fields.language, description, user?.preferredLanguage)

  const promptOptions = { crop, description, province, district, language, profile }

  let result
  try {
    result = await generateFromImages({
      system: buildDiagnosisSystemPrompt(promptOptions),
      prompt: buildDiagnosisUserPrompt(promptOptions),
      images: intake.images,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      temperature: 0.25,
      thinkingBudget: 1200,
      json: true,
    })
  } catch (error) {
    return aiFailure(error)
  }

  const parsed = extractJson<any>(result.text)

  // Defensive fallback: a malformed model reply still gives the farmer the
  // analysis text rather than an error page.
  if (!parsed) {
    return ok({
      parsed: false,
      model: result.model,
      language: language === "auto" ? "en" : language,
      rawAnalysis: result.text,
      message: "The analysis could not be structured. The raw notes from the AI are included.",
    })
  }

  const diagnosis = normaliseDiagnosis(parsed)

  // Persist for signed-in farmers. The image bytes are deliberately NOT stored:
  // there is no blob storage in this deployment and base64 in Mongo would blow
  // up the document. `imageStored: false` tells the client that.
  let diagnosisId: string | null = null
  if (user) {
    try {
      await connectDB()
      const doc = await CropDiagnosis.create({
        farmer: user._id,
        cropName: diagnosis.cropIdentified || crop || "unidentified",
        images: [],
        location: {
          district: district || undefined,
          state: province || undefined,
        },
        symptoms: {
          severity: diagnosis.severity,
          affectedArea: diagnosis.affectedArea,
        },
        aiDiagnosis: {
          disease: {
            name: diagnosis.disease || (diagnosis.category === "healthy" ? "No disease detected" : "Undetermined"),
            confidence: diagnosis.confidence,
            category: STORABLE_CATEGORIES.includes(diagnosis.category) ? diagnosis.category : undefined,
          },
          alternativeDiagnoses: diagnosis.alternatives
            .filter((alt: any) => STORABLE_CATEGORIES.includes(alt.category))
            .map((alt: any) => ({ name: alt.name, confidence: alt.confidence, category: alt.category })),
          processedAt: new Date(),
          modelVersion: result.model,
        },
        treatment: {
          recommended: diagnosis.treatment.map((step: any, index: number) => ({
            type: step.type,
            method: step.action,
            product: step.product || undefined,
            dosage: step.dosage || undefined,
            frequency: step.timing || undefined,
            priority: index === 0 ? "immediate" : "within_week",
          })),
          preventive: diagnosis.prevention.map((measure) => ({ measure })),
        },
        status: diagnosis.needsBetterPhoto || diagnosis.confidence < 55 ? "expert_required" : "diagnosed",
        priority:
          diagnosis.severity === "severe" ? "high" : diagnosis.severity === "moderate" ? "medium" : "low",
      })
      diagnosisId = String(doc._id)
    } catch (error) {
      console.error("[ai/diagnose] failed to persist diagnosis:", error)
    }
  }

  return ok({
    parsed: true,
    ...diagnosis,
    diagnosisId,
    imageStored: false,
    imagesAnalyzed: intake.images.length,
    language: language === "auto" ? "en" : language,
    model: result.model,
    truncated: result.truncated,
    authenticated: Boolean(user),
    disclaimer:
      "This is an AI reading of a photograph, not a laboratory test. Confirm anything expensive or severe with your local agriculture extension officer before spending money.",
    usage: result.usage,
  })
})
