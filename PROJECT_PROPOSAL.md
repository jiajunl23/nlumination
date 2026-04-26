# Project Proposal: NLumination

## Why "NLumination"?
The name is a portmanteau of **NL** (Natural Language) and **Illumination** — reflecting the two core ideas behind the product: using natural language as the primary interface for color grading, and the art of working with light and color in photography. It reads naturally as "illumination" at first glance, with the "NL" easter egg embedded for those who look closer.

## One-Line Description
A web-based color grading tool that lets anyone transform their photos using natural language prompts, bringing professional-quality editing to people who don't know what "split toning" means.

## The Problem
Professional color grading tools like DaVinci Resolve and Lightroom produce stunning results but have steep learning curves that shut out casual users. On the other end, AI photo editing apps make images look obviously processed and artificial. There's a gap between "pick an Instagram filter" and "learn color wheels and scopes" — no tool lets you say "make this warm and cinematic" and get a result that looks like a professional edited it. NLumination fills that gap by combining natural language interaction, curated presets, and intuitive manual controls, all running in the browser with no software to install.

## Target User
College students and hobbyist photographers who take photos on their phones, have a good eye for aesthetics (they know when a photo looks good), but lack the software, technical vocabulary, and time to learn professional color grading. The kind of person who posts on Instagram or Xiaohongshu (小红书) and wants their photos to look polished — not filtered, not AI-processed, but genuinely well-graded. The first users would be friends who have great photos sitting in their camera roll with no way to make them shine.

## Core Features (v1)
1. **Photo upload** — drag-and-drop or file picker, supporting common formats (JPEG, PNG) from phone camera rolls
2. **Natural language prompts (no LLM)** — v1 deliberately does not use any LLM or AI API. Instead, it uses the same proven approach that powered pre-LLM conversational systems (customer service chatbots, virtual assistants): **(a) Keyword/intent matching** — the system has a predefined set of styles and maps user input to the closest match using keyword detection, regex patterns, or simple NLP classifiers; **(b) Decision trees** — once a style intent is matched, the system applies the corresponding curated color grading parameters; **(c) Fallback handling** — if no match is found, the system suggests similar available styles. Users can also browse and tap predefined prompt chips (e.g., "warm sunset," "moody film," "cinematic teal," "bright and airy," "vintage fade," "cool morning").
3. **Manual fine-tuning sliders** — brightness, contrast, warmth/color temperature, saturation, and tint for users who want more control
4. **Before/after comparison** — side-by-side view on desktop; tap-to-toggle on mobile
5. **Download** — export the graded photo at full resolution
6. **Personal gallery** — authenticated users can save their graded photos to a personal collection stored in Supabase, browse their past edits, and re-download them from any device

## Tech Stack
- **Frontend:** Next.js (React-based, supports responsive design for both desktop and mobile layouts)
- **Styling:** Tailwind CSS (dark theme with colorful accent decorations, pixel-perfect polish)
- **Image Processing:** WebGL shaders via Canvas API (GPU-accelerated color transformations — color temperature, HSL adjustments, curves, LUT application — all running client-side in the browser)
- **Database:** Supabase (PostgreSQL for user data, edit history, and collection metadata; Supabase Storage for uploaded and processed images)
- **Auth:** Clerk (user accounts so people can save and access their processed photo collections across devices)
- **APIs:** No external APIs required — all image processing is algorithmic and runs client-side via custom WebGL/GLSL shaders
- **Deployment:** Vercel (seamless Next.js deployment, edge network for fast global access)
- **MCP Servers:** Supabase MCP (database management and storage), Playwright MCP (end-to-end testing of the editing workflow across desktop and mobile viewports)

## Stretch Goals
- **Reference photo style transfer** — upload a reference photo and automatically extract and apply its color grading profile to your photo using client-side computer vision techniques (histogram matching, color transfer algorithms). "Make my photo look like *this* photo."
- **Client-side ML model** — a lightweight model running in the browser (via TensorFlow.js or ONNX Runtime) that analyzes an image and suggests color grading adjustments automatically
- **Video color grading** — apply the same WebGL shaders to video frames in real-time, with preview playback and export via ffmpeg.wasm or the WebCodecs API. The shader pipeline carries over directly from photos; the new work is the playback and encoding pipeline.
- **Custom LUT creation and sharing** — let users save their favorite grading combinations as reusable LUTs and share them with others
- **Advanced manual controls** — HSL per-channel adjustment, split toning, tone curves, vignette
- **Batch processing** — apply the same grading to multiple photos at once

## Biggest Risk
1. **WebGL shader complexity** — writing GLSL shaders for professional-quality color transformations (3D LUT application, curves, split toning) is a different paradigm from typical web development. The learning curve is real, though Claude Code can help write the shader code.
2. **Natural language vagueness** — a rules-based system maps known phrases to adjustments, but users will type unexpected things. Making the system feel "smart" without an actual LLM requires careful UX design (predefined prompt chips, graceful fallbacks, tasteful defaults for vague input like "make it look better").
3. **Processing performance on large images** — phone photos can be 12MP+. WebGL runs on the GPU which helps enormously, but testing across devices (especially mobile browsers) will be critical to ensure smooth performance.
4. **The polish bar** — the vision is "elegant to the most tiny detail." Beautiful, craft-level UI takes iteration. The risk is spending too much time on design perfection at the expense of core functionality.

## Week 5 Goal
A polished, deployed web app where a user can upload a photo, use natural language prompt chips (with ~5-8 curated styles like "warm sunset," "cinematic film," "cool moody," "bright and clean") to transform the photo's color grading, see a before/after comparison, and download the result. The app should have a dark-themed, elegant UI that works on both desktop (side-by-side layout) and mobile (tap-to-toggle), with user accounts via Clerk so users can save their processed photos to a personal gallery in Supabase and browse their past edits.
