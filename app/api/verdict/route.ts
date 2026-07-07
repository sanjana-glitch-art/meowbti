import { NextRequest, NextResponse } from "next/server";
import { buildPrompt, parseVerdictResponse, fallbackFromScores, VerdictRequestBody } from "@/lib/gemini";

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 8;
const RATE_WINDOW_MS = 60_000;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count += 1;
  return true;
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
  if (!checkRateLimit(ip)) {
    return NextResponse.json(
      { error: "Too many requests. Please wait a moment." },
      { status: 429 }
    );
  }

  let body: VerdictRequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!body.freeText || body.freeText.trim().length < 3 || body.freeText.length > 1000) {
    return NextResponse.json(
      { error: "Please describe your cat in a shorter message." },
      { status: 400 }
    );
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(fallbackFromScores(body.localScores));
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const prompt = buildPrompt(body);

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.6, maxOutputTokens: 120 },
        }),
        signal: controller.signal,
      }
    );

    clearTimeout(timeout);

    if (!response.ok) {
      return NextResponse.json(fallbackFromScores(body.localScores));
    }

    const data = await response.json();
    const text: string | undefined =
      data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      return NextResponse.json(fallbackFromScores(body.localScores));
    }

    const parsed = parseVerdictResponse(text);
    if (!parsed) {
      return NextResponse.json(fallbackFromScores(body.localScores));
    }

    return NextResponse.json(parsed);
  } catch {
    clearTimeout(timeout);
    return NextResponse.json(fallbackFromScores(body.localScores));
  }
}
