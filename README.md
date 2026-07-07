# MeowBTI 🐾

**MBTI, but for cats.** Answer a series of questions about your cat's behavior, describe them in your own words, and let AI issue an official "case file" verdict on their personality type - delivered as a shareable, downloadable retro-pixel result card.

Built for **The Coding Kitty Hackathon 2026** - theme: *World Cat Domination Day*.

---

## Table of Contents

- [What This Is](#what-this-is)
- [How It Fits the Theme](#how-it-fits-the-theme)
- [Live Demo](#live-demo)
- [Tech Stack](#tech-stack)
- [How It Works](#how-it-works)
- [Setup & Running Locally](#setup--running-locally)
- [Environment Variables](#environment-variables)
- [Project Structure](#project-structure)
- [AI Tools Used in Development](#ai-tools-used-in-development)
- [Known Limitations](#known-limitations)
- [Credits](#credits)

---

## What This Is

Every cat has a personality - some rule from the shadows, some knock things off tables out of principle, some have achieved a final, unmovable loaf state. MeowBTI takes a cat owner through:

1. **Cat Intake** - name and (optional) photo upload
2. **An 8-question scroll-driven quiz** - each answer nudges the cat's score toward one of six personality archetypes
3. **A free-text description** - owner describes their cat in their own words
4. **AI Verdict** - the Gemini API weighs the quiz scoring and the free-text description to pick a final type and write a short, dry, bureaucratic "case file" verdict
5. **Result Card** - a retro, government-file-styled card with the cat's name, photo, type, verdict, and traits - downloadable as a PNG or shareable directly from the device

## How It Fits the Theme

*World Cat Domination Day* is about celebrating (and playfully exaggerating) the idea that cats already run our lives. MeowBTI leans directly into this: it treats every household cat as a subject of "official" behavioral classification, complete with case codes, a bureaucratic verdict tone, and a fictional "Institute of Feline Behavioral Sciences" issuing the report. The framing isn't a surface-level cat reference - the entire UX (intake form, case file card, dry official verdict copy) is built around the idea of formally documenting a cat's dominion over its household, one classified case file at a time.

## Live Demo

- **Live app:** _[add your deployed Vercel URL here]_
- **Video walkthrough:** _[add your video link here]_
- **Repository:** github.com/sanjana-glitch-art/meowbti

## Tech Stack

| Layer | Choice |
|---|---|
| Framework | Next.js (App Router) + TypeScript |
| Styling | Tailwind CSS + custom CSS (retro pixel-art theme) |
| AI Verdict Generation | Google Gemini API (`gemini-2.0-flash`) |
| Image capture (result card) | html2canvas |
| Rate limiting | In-memory per-IP limiter (see [Known Limitations](#known-limitations)) |
| Deployment | Vercel |

## How It Works

See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for a full breakdown of the request flow, component structure, and how the AI verdict is generated. Short version:

```
CatIntake → ScrollQuiz (scores accumulate per personality type)
          → free-text description
          → POST /api/verdict (server-side)
              → builds a prompt combining quiz scores + free text
              → calls Gemini API
              → validates & parses the JSON response
              → falls back to a deterministic scored result if Gemini fails
          → ResultsSection renders CatCard
          → html2canvas captures the card for download/share
```

## Setup & Running Locally

**Prerequisites:** Node.js 18+, npm

```bash
# 1. Clone the repo
git clone https://github.com/sanjana-glitch-art/meowbti.git
cd meowbti

# 2. Install dependencies
npm install

# 3. Set up environment variables (see below)
cp .env.example .env
# then fill in your GEMINI_API_KEY

# 4. Run the dev server
npm run dev
```

Then open `http://localhost:3000`.

> **Note for judges:** if no `GEMINI_API_KEY` is configured, the app does **not** break - the `/api/verdict` route automatically falls back to a deterministic verdict generated from the quiz scores alone, so the full flow (intake → quiz → result card → download/share) still works end-to-end without any API key.

## Environment Variables

| Variable | Required? | Purpose |
|---|---|---|
| `GEMINI_API_KEY` | Optional (recommended) | Enables AI-generated verdicts via the Gemini API. Without it, the app uses a scored fallback verdict instead. |

No environment variable is ever exposed to the client - the Gemini API key is only read server-side inside the `/api/verdict` route handler.

## Project Structure

```
MeowBTI/
├── app/
│   ├── api/verdict/route.ts     # Server-side verdict endpoint (Gemini call + fallback)
│   ├── layout.tsx
│   ├── page.tsx                 # Top-level page state machine (intake → quiz → results)
│   └── globals.css
├── components/
│   ├── landing/
│   │   ├── LandingHero.tsx      # Hero section, animated cat, meow sound
│   │   ├── CatIntake.tsx        # Name + photo capture (with client-side image resize)
│   │   └── Footer.tsx
│   ├── quiz/
│   │   ├── QuizBackdrop.tsx     # Animated scroll-reactive pixel background
│   │   └── ScrollQuiz.tsx       # Scroll-driven question flow + free text
│   └── results/
│       ├── CatCard.tsx          # The result card UI
│       └── ResultsSection.tsx   # Fetches verdict, handles loading/error/reveal states
├── lib/
│   ├── catTypes.ts              # The 6 personality archetypes
│   ├── questions.ts              # Quiz question bank + per-option scoring weights
│   ├── gemini.ts                 # Prompt building + response parsing/validation
│   └── mosaic.ts                 # Seeded PRNG for consistent pixel-art backgrounds
└── docs/
    ├── README.md                 # This file
    ├── ARCHITECTURE.md
    └── SECURITY.md
```

## AI Tools Used in Development

This project was built with the help of **Claude** (Anthropic) as a coding assistant and code reviewer throughout development, and the **Gemini API** as the core AI feature powering the verdict-generation itself. All product decisions - the six personality archetypes, the retro government-office visual concept, the question wording, the scoring model, the quiz flow and interactions - were designed and directed by the author. Claude was used to review code for bugs, security issues, and edge cases (e.g. image size limits, request timeouts, error-state handling) and to help implement fixes; it was not used to generate the product concept or design direction unsupervised.

## Known Limitations

Documented transparently rather than hidden:

- **No user accounts or persistence** - each session is ephemeral; results are not saved server-side. This was an intentional scope decision for the hackathon timeframe.
- **Gemini verdict length** is prompt-constrained but not hard-capped server-side beyond token limits; the UI truncates visually via CSS as a safety net.

## Credits

Built by **Sanjana** for The Coding Kitty Hackathon 2026.
