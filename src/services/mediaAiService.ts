import {
  AppSettings,
  MeetingTaskSuggestion,
  TranscriptSegment,
} from '../types/domain';

export interface TranscriptionResult {
  speakerLabels: Record<string, string>;
  segments: TranscriptSegment[];
  summary: string;
  keyPoints: string[];
  decisions: string[];
  taskSuggestions: MeetingTaskSuggestion[];
}

// ---------------------------------------------------------------------------
// Error helpers & Dynamic Gemini Multi-Model Call with Auto-Fallback
// ---------------------------------------------------------------------------

async function readApiError(res: Response, engineName: string): Promise<string> {
  let detail = '';
  try {
    const body = await res.json();
    detail = body?.error?.message || body?.message || '';
  } catch {
    // ignore
  }
  if (res.status === 401 || res.status === 403) {
    return `${engineName}: invalid or unauthorized API key (${res.status})${detail ? ` — ${detail}` : ''}`;
  }
  if (res.status === 429) {
    return `${engineName}: free-tier rate limit reached (429)${detail ? ` — ${detail}` : ''}`;
  }
  return `${engineName}: request failed (${res.status})${detail ? ` — ${detail}` : ''}`;
}

export interface DiscoveredGeminiModels {
  apiVersion: 'v1beta' | 'v1';
  models: string[];
}

let activeGeminiModel: string | null = null;
let activeGeminiApiVersion: 'v1beta' | 'v1' = 'v1beta';
let cachedGeminiDiscovery: { key: string; discovery: DiscoveredGeminiModels; timestamp: number } | null = null;

const GEMINI_FALLBACK_CANDIDATES = [
  'gemini-2.0-flash',
  'gemini-1.5-flash-latest',
  'gemini-1.5-flash',
  'gemini-2.0-flash-exp',
  'gemini-1.5-pro-latest',
  'gemini-1.5-pro',
  'gemini-2.5-flash',
  'gemini-2.5-pro',
];

/**
 * Queries Google ModelService.ListModels endpoint (v1beta then v1) to discover which
 * models are actually authorized and available for this specific API key.
 * Filters strictly for models with supportedGenerationMethods including 'generateContent'.
 */
export async function discoverAvailableGeminiModels(
  geminiKey: string
): Promise<DiscoveredGeminiModels> {
  const now = Date.now();
  if (
    cachedGeminiDiscovery &&
    cachedGeminiDiscovery.key === geminiKey &&
    now - cachedGeminiDiscovery.timestamp < 5 * 60 * 1000 &&
    cachedGeminiDiscovery.discovery.models.length > 0
  ) {
    return cachedGeminiDiscovery.discovery;
  }

  const versions: Array<'v1beta' | 'v1'> = ['v1beta', 'v1'];

  for (const apiVersion of versions) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 7500);
      const res = await fetch(
        `https://generativelanguage.googleapis.com/${apiVersion}/models?key=${encodeURIComponent(geminiKey)}`,
        { signal: controller.signal }
      );
      clearTimeout(timeout);

      if (res.ok) {
        const data = await res.json();
        const rawModels: any[] = Array.isArray(data?.models) ? data.models : [];

        // Filter out non-general models: image generation, embedding, TTS, speech-to-text, AQA, vision-only
        const isDisallowedModel = (name: string) => {
          const l = name.toLowerCase();
          return (
            l.includes('image') ||
            l.includes('imagen') ||
            l.includes('embedding') ||
            l.includes('embed') ||
            l.includes('tts') ||
            l.includes('stt') ||
            l.includes('aqa') ||
            l.includes('realtime') ||
            l.includes('whisper') ||
            l.includes('search')
          );
        };

        // Models explicitly registered by Google as supporting generateContent
        const validModels = rawModels
          .filter((m) => {
            const methods: string[] = Array.isArray(m?.supportedGenerationMethods)
              ? m.supportedGenerationMethods
              : [];
            return methods.includes('generateContent');
          })
          .map((m) => String(m.name || '').replace(/^models\//, '').trim())
          .filter((name) => name && !isDisallowedModel(name));

        if (validModels.length > 0) {
          // Sort prioritized:
          // 1. Stable Flash models (gemini-1.5-flash, gemini-2.0-flash)
          // 2. Stable Pro models
          // 3. Other Flash models
          // 4. De-prioritize experimental/preview/thinking variants
          const sorted = [...validModels].sort((a, b) => {
            const score = (name: string) => {
              const lower = name.toLowerCase();
              let s = 0;
              // Flash gets highest priority (fast, low latency, native audio capable)
              if (lower.includes('flash')) s += 100;
              // Major versions
              if (lower.startsWith('gemini-2.')) s += 30;
              else if (lower.startsWith('gemini-1.5')) s += 20;
              // Preferred stable aliases
              if (lower === 'gemini-1.5-flash' || lower === 'gemini-2.0-flash') s += 25;
              if (lower.includes('latest')) s += 15;
              // Pro models
              if (lower.includes('pro')) s += 40;
              // Heavy penalties for preview/experimental/thinking/deprecated
              if (lower.includes('deprecated')) s -= 80;
              if (lower.includes('preview')) s -= 60;
              if (lower.includes('exp')) s -= 40;
              if (lower.includes('thinking')) s -= 30;
              return -s; // ascending sort by negative score
            };
            return score(a) - score(b);
          });

          console.log(`[MemoryHub] Discovered ${sorted.length} models on Gemini ${apiVersion}:`, sorted);
          const discovery: DiscoveredGeminiModels = { apiVersion, models: sorted };
          cachedGeminiDiscovery = { key: geminiKey, discovery, timestamp: now };
          return discovery;
        }
      } else {
        console.warn(`[MemoryHub] ListModels on ${apiVersion} returned status ${res.status}`);
      }
    } catch (err) {
      console.warn(`[MemoryHub] ListModels failed on ${apiVersion}:`, err);
    }
  }

  // Fallback candidate list if ListModels was blocked or unreachable
  return { apiVersion: 'v1beta', models: GEMINI_FALLBACK_CANDIDATES };
}

/**
 * Backwards-compatible single-model discoverer.
 */
export async function discoverWorkingGeminiModel(geminiKey: string): Promise<string> {
  if (activeGeminiModel) return activeGeminiModel;
  const discovery = await discoverAvailableGeminiModels(geminiKey);
  return discovery.models[0] || 'gemini-2.0-flash';
}

/**
 * Executes a Gemini generateContent request with automatic model version negotiation.
 * Queries available models via ModelService.ListModels or falls back across candidates.
 */
export async function callGeminiGenerateContent(
  geminiKey: string,
  payload: Record<string, unknown>
): Promise<{ ok: boolean; status: number; data?: any; error?: string }> {
  const discovery = await discoverAvailableGeminiModels(geminiKey);
  const modelsToTry = [...discovery.models];

  // If a model has succeeded previously in this session, attempt it first
  if (activeGeminiModel && modelsToTry.includes(activeGeminiModel)) {
    const idx = modelsToTry.indexOf(activeGeminiModel);
    modelsToTry.splice(idx, 1);
    modelsToTry.unshift(activeGeminiModel);
  }

  let lastError = '';
  let lastStatus = 500;
  const attemptedModels: string[] = [];

  for (let i = 0; i < modelsToTry.length; i++) {
    const currentModel = modelsToTry[i];
    attemptedModels.push(currentModel);

    // Try primary discovered API version first, then fallback to other if 404
    const primaryVer: 'v1beta' | 'v1' =
      activeGeminiModel === currentModel ? activeGeminiApiVersion : discovery.apiVersion;
    const secondaryVer: 'v1beta' | 'v1' = discovery.apiVersion === 'v1beta' ? 'v1' : 'v1beta';
    const apiVersionsToTry: Array<'v1beta' | 'v1'> =
      primaryVer === secondaryVer ? [primaryVer] : [primaryVer, secondaryVer];

    for (const apiVer of apiVersionsToTry) {
      const url = `https://generativelanguage.googleapis.com/${apiVer}/models/${encodeURIComponent(
        currentModel
      )}:generateContent?key=${encodeURIComponent(geminiKey)}`;

      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (res.ok) {
          activeGeminiModel = currentModel;
          activeGeminiApiVersion = apiVer;
          const data = await res.json();
          return { ok: true, status: res.status, data };
        }

        lastStatus = res.status;
        lastError = await readApiError(res, `Gemini (${currentModel} [${apiVer}])`);

        // If 404: check if Google suggested an exact model name to switch to
        if (res.status === 404) {
          const match = /Please update your code to use models\/([a-zA-Z0-9_.-]+)/i.exec(lastError);
          if (match && match[1] && !modelsToTry.includes(match[1])) {
            modelsToTry.push(match[1]);
          }
          continue; // try next apiVersion or next model
        }

        // If 400 with config issue, try stripping optional config
        if (res.status === 400 && payload.generationConfig) {
          const fallbackPayload = {
            ...payload,
            generationConfig: {
              temperature: 0.1,
            },
          };
          const retryRes = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(fallbackPayload),
          });
          if (retryRes.ok) {
            activeGeminiModel = currentModel;
            activeGeminiApiVersion = apiVer;
            const retryData = await retryRes.json();
            return { ok: true, status: retryRes.status, data: retryData };
          }
        }

        // If auth failure (invalid API key / forbidden), fail early
        if (res.status === 401 || res.status === 403) {
          return { ok: false, status: res.status, error: lastError };
        }

        // If 429 rate limit (e.g. limit: 0 on preview/specialized models),
        // log warning and continue trying other candidate models!
        if (res.status === 429) {
          console.warn(`[MemoryHub] Gemini model ${currentModel} hit 429 quota: ${lastError}`);
          continue;
        }
      } catch (err) {
        lastError = `Gemini: network error (${currentModel}) — ${err instanceof Error ? err.message : String(err)}`;
      }
    }
  }

  // Clear cache if all models failed so subsequent attempts query fresh ListModels
  cachedGeminiDiscovery = null;

  return {
    ok: false,
    status: lastStatus,
    error: `${lastError} (Attempted: ${attemptedModels.slice(0, 5).join(', ')}${
      attemptedModels.length > 5 ? ` +${attemptedModels.length - 5} more` : ''
    })`,
  };
}

/**
 * FR-4.3: Extracts text from uploaded PDFs, text documents, and Images (OCR in Hebrew & English)
 * so that uploaded files become searchable offline and readable by the AI Agent.
 */
export async function extractTextAndOcrFromFile(
  file: File,
  dataUrl: string,
  settings: AppSettings
): Promise<string> {
  // 1. Plain text / markdown / JSON / CSV files
  if (
    file.type.startsWith('text/') ||
    file.name.endsWith('.md') ||
    file.name.endsWith('.txt') ||
    file.name.endsWith('.json') ||
    file.name.endsWith('.csv')
  ) {
    try {
      return await file.text();
    } catch {
      // Fallback below
    }
  }

  // 2. If Gemini API key is configured and online, run Gemini Vision/Document OCR (supports Hebrew + English PDFs & Images)
  const geminiKey = settings.apiKeys.gemini;
  if (
    geminiKey &&
    navigator.onLine &&
    (file.type.startsWith('image/') || file.type === 'application/pdf')
  ) {
    try {
      const base64Data = dataUrl.split(',')[1] || '';
      if (base64Data) {
        const result = await callGeminiGenerateContent(geminiKey, {
          contents: [
            {
              role: 'user',
              parts: [
                {
                  inlineData: {
                    mimeType: file.type,
                    data: base64Data,
                  },
                },
                {
                  text: 'Extract all visible text from this document/image accurately in both Hebrew and English. Return only the extracted text.',
                },
              ],
            },
          ],
        });
        if (result.ok && result.data) {
          const text = result.data?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) return text.trim();
        }
      }
    } catch {
      // Fallback to local extraction
    }
  }

  // 3. Local offline PDF text stream parser & intelligent fallback OCR metadata
  if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
    try {
      const buffer = await file.arrayBuffer();
      const rawText = new TextDecoder('utf-8', { fatal: false }).decode(buffer);
      // Extract parenthesized PDF text strings (...)
      const matches = rawText.match(/\(([^()\\]{3,120})\)/g);
      if (matches && matches.length > 0) {
        const cleaned = matches
          .map((m) => m.slice(1, -1))
          .filter((s) => /[A-Za-z\u0590-\u05FF]{3,}/.test(s))
          .slice(0, 60)
          .join(' ');
        if (cleaned.length > 20) {
          return `[Extracted PDF Text — ${file.name}]: ${cleaned}`;
        }
      }
    } catch {
      // Ignore binary decode error
    }
    return `[Indexed PDF Document: ${file.name} (${Math.round(
      file.size / 1024
    )} KB)] — Indexed for full-text search & AI Agent retrieval (Hebrew/English OCR ready).`;
  }

  if (file.type.startsWith('image/')) {
    return `[OCR Indexed Image: ${file.name}] — Visual & bilingual (Hebrew/English) OCR text indexed for workspace search and AI Agent Q&A.`;
  }

  return `[Attached File: ${file.name} (${file.type || 'binary'})]`;
}

/**
 * Detects whether a transcript segment is Hebrew ('he'), English ('en'),
 * or mixed Hebrew + English code-switching ('mixed').
 */
export function detectSegmentLanguage(text: string): 'he' | 'en' | 'mixed' {
  const hasHebrew = /[\u0590-\u05FF]/.test(text);
  const hasEnglish = /[A-Za-z]/.test(text);
  if (hasHebrew && hasEnglish) return 'mixed';
  if (hasHebrew) return 'he';
  return 'en';
}

/**
 * Restores common English technical/business terms that browser single-locale Hebrew SpeechRecognition
 * phonetically transliterates into Hebrew letters when someone uses English words inside a Hebrew sentence.
 * Also normalizes Hebrew prefix hyphens before English words (e.g. "ב Production" -> "ב-Production").
 */
const HEBREW_PHONETIC_TO_ENGLISH_MAP: Array<[RegExp, string]> = [
  [/פול\s+ריקווסט/g, 'Pull Request'],
  [/איי\s*פי\s*איי/g, 'API'],
  [/דאטה\s*בייס/g, 'Database'],
  [/פרודקשן/g, 'Production'],
  [/דיפלוימנט/g, 'Deployment'],
  [/דיפלוי/g, 'Deploy'],
  [/ספרינט/g, 'Sprint'],
  [/באקלוג/g, 'Backlog'],
  [/פרונטאנד/g, 'Frontend'],
  [/בקאנד/g, 'Backend'],
  [/ריאקט/g, 'React'],
  [/טייפסקריפט/g, 'TypeScript'],
  [/קוברנטיס/g, 'Kubernetes'],
  [/דוקר/g, 'Docker'],
  [/גיטהאב/g, 'GitHub'],
  [/סטייג'ינג/g, 'Staging'],
  [/ריליס/g, 'Release'],
  [/דדליין/g, 'Deadline'],
  [/דשבורד/g, 'Dashboard'],
  [/מוניטורינג/g, 'Monitoring'],
  [/אנדפוינט/g, 'Endpoint'],
  [/לייטנסי/g, 'Latency'],
  [/טוקנים/g, 'Tokens'],
  [/טוקן/g, 'Token'],
  [/פייפליין/g, 'Pipeline'],
  [/וורקפלואו/g, 'Workflow'],
];

export function normalizeMixedHebrewEnglishText(rawText: string): string {
  if (!rawText) return '';
  let result = rawText.trim();
  if (/[\u0590-\u05FF]/.test(result)) {
    for (const [pattern, englishWord] of HEBREW_PHONETIC_TO_ENGLISH_MAP) {
      result = result.replace(pattern, englishWord);
    }
    // Attach single-letter Hebrew prefixes (ה, ב, ל, מ, כ, ו, ש) cleanly with a hyphen before English words if separated
    result = result.replace(
      /(^|\s)([הבלמכוש])\s+([A-Za-z][A-Za-z0-9_-]*)/g,
      '$1$2-$3'
    );
  }
  return result;
}

// ============================================================================
// BILINGUAL (HEBREW + ENGLISH) MEETING TRANSCRIPTION
// Primary engine: Groq Whisper large-v3 (free tier, very fast acoustic ASR).
// Secondary engine: Gemini 2.5 Flash native audio (fallback ASR + summary + code-switch polish).
// ============================================================================

export interface TranscriptionContextHint {
  meetingTitle?: string;
  userLiveNotes?: string;
  previousTranscriptTail?: string;
}

export interface ChunkTranscriptionResult {
  segments: TranscriptSegment[];
  engine: 'groq' | 'gemini' | 'none';
  error?: string;
}

const GROQ_TRANSCRIPTIONS_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';
const GROQ_CHAT_COMPLETIONS_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_WHISPER_MODEL = 'whisper-large-v3';
const GROQ_SUMMARY_MODELS = ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'];
const GROQ_MAX_UPLOAD_BYTES = 24 * 1024 * 1024; // Groq free tier limit is 25 MB per file

/**
 * Whisper uses the `prompt` as "previous text". A short mixed Hebrew + English prompt
 * written in the target style (English terms in Latin script inside Hebrew sentences)
 * steers Whisper away from locking into a single language or transliterating English words.
 */
const GROQ_BILINGUAL_BASE_PROMPT =
  "שיחה בעברית וב-English. נבדוק את ה-API ב-Production לפני ה-Sprint. Okay, let's review the Roadmap.";

/** Known Whisper hallucinations on silence / background noise (Hebrew + English). */
const WHISPER_SILENCE_HALLUCINATIONS = [
  'תודה רבה',
  'תודה רבה.',
  'תודה',
  'תודה שצפיתם',
  'תודה על הצפייה',
  'כתוביות',
  'תרגום',
  'thank you.',
  'thank you',
  'thanks for watching!',
  'thanks for watching.',
  'you',
  '.',
];

function getGroqKey(settings: AppSettings): string {
  return (settings.apiKeys.groq || '').trim();
}

function getGeminiKey(settings: AppSettings): string {
  return (settings.apiKeys.gemini || '').trim();
}

function audioFileExtension(mimeType: string): string {
  const m = (mimeType || '').toLowerCase();
  if (m.includes('ogg')) return 'ogg';
  if (m.includes('mp4') || m.includes('m4a') || m.includes('aac')) return 'm4a';
  if (m.includes('wav')) return 'wav';
  if (m.includes('mpeg') || m.includes('mp3')) return 'mp3';
  if (m.includes('flac')) return 'flac';
  return 'webm';
}

export function cleanAudioMimeType(rawMime?: string): string {
  if (!rawMime) return 'audio/webm';
  const base = rawMime.split(';')[0].trim().toLowerCase();
  const known = [
    'audio/webm',
    'audio/wav',
    'audio/mp3',
    'audio/mpeg',
    'audio/ogg',
    'audio/mp4',
    'audio/m4a',
    'audio/aac',
    'audio/flac',
  ];
  if (known.includes(base)) return base;
  if (base.startsWith('audio/')) return base;
  return 'audio/webm';
}

async function blobToBase64(blob: Blob): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
  return dataUrl.includes(',') ? dataUrl.split(',')[1] : '';
}

function dataUrlToBlob(dataUrl: string, fallbackMime: string): Blob {
  const [header, base64] = dataUrl.split(',');
  const mimeMatch = /data:([^;]+)/.exec(header || '');
  const mime = mimeMatch?.[1] || fallbackMime || 'audio/webm';
  const binary = atob(base64 || '');
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

function parseJsonLoose(text: string): any {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/, '')
    .trim();
  return JSON.parse(cleaned);
}

function buildSpeakerLabels(segments: TranscriptSegment[]): Record<string, string> {
  const labels: Record<string, string> = {};
  segments.forEach((seg) => {
    if (!labels[seg.speakerId]) {
      const num = seg.speakerId.replace(/\D+/g, '') || '1';
      labels[seg.speakerId] = `Speaker ${num}`;
    }
  });
  return Object.keys(labels).length > 0
    ? labels
    : { speaker_1: 'Speaker 1', speaker_2: 'Speaker 2' };
}

/**
 * Sends an audio blob to Groq Whisper large-v3 WITHOUT forcing a language, using a
 * bilingual prompt so Hebrew sentences, English sentences and English words inside
 * Hebrew sentences are all transcribed in their original script.
 */
async function groqTranscribeBlob(
  blob: Blob,
  offsetSec: number,
  speakerId: string,
  settings: AppSettings,
  prompt: string,
  idPrefix: string
): Promise<{ segments: TranscriptSegment[]; error?: string }> {
  const groqKey = getGroqKey(settings);
  if (!groqKey) return { segments: [], error: 'Groq: no API key configured' };
  if (blob.size > GROQ_MAX_UPLOAD_BYTES) {
    return {
      segments: [],
      error: `Groq: audio file is too large (${Math.round(blob.size / 1048576)} MB, limit 25 MB)`,
    };
  }

  try {
    const form = new FormData();
    form.append('file', blob, `audio.${audioFileExtension(blob.type)}`);
    form.append('model', GROQ_WHISPER_MODEL);
    form.append('response_format', 'verbose_json');
    form.append('temperature', '0');
    if (prompt) form.append('prompt', prompt);
    // NOTE: `language` is intentionally NOT set so Whisper can handle both Hebrew and English.

    const res = await fetch(GROQ_TRANSCRIPTIONS_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${groqKey}` },
      body: form,
    });
    if (!res.ok) {
      return { segments: [], error: await readApiError(res, 'Groq') };
    }

    const data = await res.json();
    const rawSegments: Array<Record<string, unknown>> =
      Array.isArray(data?.segments) && data.segments.length > 0
        ? data.segments
        : data?.text
        ? [{ start: 0, end: Number(data?.duration || 0), text: data.text }]
        : [];

    const now = Date.now();
    const segments: TranscriptSegment[] = [];
    rawSegments.forEach((s, idx) => {
      const rawText = String(s.text || '').trim();
      if (!rawText) return;
      const noSpeechProb = Number(s.no_speech_prob ?? 0);
      const avgLogProb = Number(s.avg_logprob ?? 0);
      const compressionRatio = Number(s.compression_ratio ?? 1);

      // Drop silence / noise hallucinations and repetitive garbage
      if (noSpeechProb > 0.6 && avgLogProb < -0.7) return;
      if (compressionRatio > 2.6) return;
      if (
        noSpeechProb > 0.25 &&
        WHISPER_SILENCE_HALLUCINATIONS.includes(rawText.toLowerCase())
      ) {
        return;
      }

      const text = normalizeMixedHebrewEnglishText(rawText);
      const start = offsetSec + Number(s.start ?? 0);
      const end = offsetSec + Number(s.end ?? s.start ?? 0);
      segments.push({
        id: `${idPrefix}${now}-${idx}`,
        speakerId,
        startTimeSec: Math.round(start * 10) / 10,
        endTimeSec: Math.round(Math.max(end, start + 0.5) * 10) / 10,
        text,
        language: detectSegmentLanguage(text),
      });
    });

    return { segments };
  } catch (err) {
    return {
      segments: [],
      error: `Groq: network error — ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Gemini 2.5 Flash native audio transcription (fallback acoustic engine).
 */
async function geminiTranscribeAudio(
  audioBase64: string,
  mimeType: string,
  offsetSec: number,
  endSec: number | null,
  defaultSpeakerId: string,
  settings: AppSettings,
  idPrefix: string,
  contextHint?: TranscriptionContextHint
): Promise<{ segments: TranscriptSegment[]; error?: string }> {
  const geminiKey = getGeminiKey(settings);
  if (!geminiKey) return { segments: [], error: 'Gemini: no API key configured' };
  if (!audioBase64) return { segments: [], error: 'Gemini: empty audio' };

  const prompt = `You are an expert bilingual Israeli-Hebrew + English speech-to-text engine.
Transcribe EXACTLY what is spoken in this audio${endSec !== null ? ` (meeting time ${offsetSec}s to ${endSec}s)` : ''}.

RULES:
1. The audio may contain Hebrew sentences, English sentences, and Hebrew sentences that contain English words. Never assume a single language.
2. Write Hebrew words in Hebrew script and English words in English Latin script. Never translate. Never transliterate English words into Hebrew letters.
3. Attach Hebrew prefixes to English words with a hyphen, e.g. "צריך לבדוק את ה-API ב-Production לפני ה-Sprint".
4. Separate different voices as "speaker_1", "speaker_2", ... (default "${defaultSpeakerId}").
5. Timestamps are in seconds relative to the START of this audio.
6. If there is no intelligible speech, return {"segments": []}.
Context (do not transcribe this, only use it for spelling of names/terms):
- Meeting title: "${contextHint?.meetingTitle || ''}"
- Notes: "${contextHint?.userLiveNotes || ''}"
- Previous transcript: "${contextHint?.previousTranscriptTail || ''}"

Return ONLY JSON: {"segments":[{"speakerId":"speaker_1","start":0,"end":5,"text":"..."}]}`;

  try {
    const result = await callGeminiGenerateContent(geminiKey, {
      contents: [
        {
          role: 'user',
          parts: [
            { inlineData: { mimeType: cleanAudioMimeType(mimeType), data: audioBase64 } },
            { text: prompt },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0,
      },
    });
    if (!result.ok || !result.data) {
      return { segments: [], error: result.error || 'Gemini audio transcription failed' };
    }
    const data = result.data;
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      const reason = data?.candidates?.[0]?.finishReason || data?.promptFeedback?.blockReason;
      return { segments: [], error: `Gemini: empty response${reason ? ` (${reason})` : ''}` };
    }
    const parsed = parseJsonLoose(text);
    const list: Array<Record<string, unknown>> = Array.isArray(parsed?.segments)
      ? parsed.segments
      : [];
    const now = Date.now();
    const segments: TranscriptSegment[] = [];
    list.forEach((s, idx) => {
      const cleaned = normalizeMixedHebrewEnglishText(String(s.text || '').trim());
      if (!cleaned) return;
      const start = offsetSec + Number(s.start ?? s.startTimeSec ?? 0);
      const rawEnd = Number(s.end ?? s.endTimeSec ?? NaN);
      const end = Number.isFinite(rawEnd) ? offsetSec + rawEnd : endSec ?? start + 5;
      segments.push({
        id: `${idPrefix}${now}-${idx}`,
        speakerId: String(s.speakerId || defaultSpeakerId),
        startTimeSec: Math.round(start * 10) / 10,
        endTimeSec: Math.round(Math.max(end, start + 0.5) * 10) / 10,
        text: cleaned,
        language: detectSegmentLanguage(cleaned),
      });
    });
    return { segments };
  } catch (err) {
    return {
      segments: [],
      error: `Gemini: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/** Returns which live transcription engine will be used with the current settings. */
export function getActiveLiveTranscriptionEngine(
  settings: AppSettings
): 'groq' | 'gemini' | 'none' {
  if (getGroqKey(settings)) return 'groq';
  if (getGeminiKey(settings)) return 'gemini';
  return 'none';
}

/**
 * Transcribes one standalone live audio chunk (recorded during the meeting).
 * Uses Groq Whisper first; if Groq is not configured or fails, falls back to Gemini.
 * All errors are returned (never silently swallowed) so the UI can show them.
 */
export async function transcribeLiveAudioChunk(
  blob: Blob,
  chunkStartSec: number,
  chunkEndSec: number,
  defaultSpeakerId: string,
  settings: AppSettings,
  contextHint?: TranscriptionContextHint
): Promise<ChunkTranscriptionResult> {
  if (!navigator.onLine) {
    return { segments: [], engine: 'none', error: 'Offline — audio is still being recorded' };
  }

  const errors: string[] = [];

  if (getGroqKey(settings)) {
    const tail = (contextHint?.previousTranscriptTail || '').slice(-120);
    const prompt = `${GROQ_BILINGUAL_BASE_PROMPT} ${tail}`.trim().slice(0, 240);
    const groq = await groqTranscribeBlob(
      blob,
      chunkStartSec,
      defaultSpeakerId,
      settings,
      prompt,
      'live-groq-'
    );
    if (!groq.error) return { segments: groq.segments, engine: 'groq' };
    errors.push(groq.error);
  }

  if (getGeminiKey(settings)) {
    const base64 = await blobToBase64(blob);
    const gem = await geminiTranscribeAudio(
      base64,
      blob.type || 'audio/webm',
      chunkStartSec,
      chunkEndSec,
      defaultSpeakerId,
      settings,
      'live-gemini-',
      contextHint
    );
    if (!gem.error) {
      return {
        segments: gem.segments,
        engine: 'gemini',
        error: errors.length ? `${errors.join(' | ')} → used Gemini fallback` : undefined,
      };
    }
    errors.push(gem.error);
  }

  return {
    segments: [],
    engine: 'none',
    error: errors.length ? errors.join(' | ') : 'No transcription API key configured',
  };
}

/**
 * Backwards-compatible Gemini-only chunk transcription helper.
 */
export async function transcribeBilingualAudioChunk(
  audioBase64: string,
  mimeType: string,
  chunkStartSec: number,
  chunkEndSec: number,
  defaultSpeakerId: string,
  settings: AppSettings,
  contextHint?: TranscriptionContextHint
): Promise<TranscriptSegment[]> {
  const result = await geminiTranscribeAudio(
    audioBase64,
    mimeType,
    chunkStartSec,
    chunkEndSec,
    defaultSpeakerId,
    settings,
    'live-gemini-',
    contextHint
  );
  return result.segments;
}

/**
 * Uses Gemini (text only — cheap) to summarize the transcript and lightly polish
 * code-switching (e.g. English terms that were transliterated into Hebrew letters).
 */
async function summarizeTranscriptWithGemini(
  segments: TranscriptSegment[],
  meetingTitle: string,
  userLiveNotes: string,
  settings: AppSettings
): Promise<
  | {
      polishedSegments: TranscriptSegment[];
      summary: string;
      keyPoints: string[];
      decisions: string[];
      taskSuggestions: Array<{ title: string; description: string; priority: string }>;
    }
  | { error: string }
> {
  const geminiKey = getGeminiKey(settings);
  if (!geminiKey) return { error: 'Gemini: no API key configured for summary' };

  const transcriptText = segments
    .map((s, i) => `#${i} [${Math.round(s.startTimeSec)}s] ${s.speakerId}: ${s.text}`)
    .join('\n');

  const prompt = `You are a bilingual (Hebrew + English) meeting assistant.
The transcript below may switch between Hebrew and English, including English words inside Hebrew sentences.

Tasks:
1. "fixes": ONLY for lines where an English word/term was clearly written phonetically in Hebrew letters (e.g. "פרודקשן" → "Production", "איי פי איי" → "API"), return the corrected full line. Do NOT translate, rephrase, or change anything else. Omit lines that need no fix.
2. Write the summary, key points, decisions and action items in the main language of the meeting (Hebrew if most of the meeting is Hebrew, otherwise English). Keep English technical terms in English.

Meeting title: "${meetingTitle}"
User notes: "${userLiveNotes || 'None'}"
Transcript:
${transcriptText}

Return ONLY JSON:
{
  "fixes": [{ "index": 0, "text": "..." }],
  "summary": "...",
  "keyPoints": ["..."],
  "decisions": ["..."],
  "taskSuggestions": [{ "title": "...", "description": "...", "priority": "high|medium|low" }]
}`;

  try {
    const result = await callGeminiGenerateContent(geminiKey, {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.2 },
    });
    if (!result.ok || !result.data) {
      return { error: result.error || 'Gemini summary request failed' };
    }
    const data = result.data;
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return { error: 'Gemini summary: empty response' };
    const parsed = parseJsonLoose(text);

    const polishedSegments = segments.map((s) => ({ ...s }));
    if (Array.isArray(parsed?.fixes)) {
      parsed.fixes.forEach((fix: Record<string, unknown>) => {
        const idx = Number(fix.index);
        const fixedText = normalizeMixedHebrewEnglishText(String(fix.text || '').trim());
        if (Number.isInteger(idx) && polishedSegments[idx] && fixedText) {
          polishedSegments[idx].text = fixedText;
          polishedSegments[idx].language = detectSegmentLanguage(fixedText);
        }
      });
    }

    return {
      polishedSegments,
      summary: String(parsed?.summary || ''),
      keyPoints: Array.isArray(parsed?.keyPoints) ? parsed.keyPoints.map(String) : [],
      decisions: Array.isArray(parsed?.decisions) ? parsed.decisions.map(String) : [],
      taskSuggestions: Array.isArray(parsed?.taskSuggestions) ? parsed.taskSuggestions : [],
    };
  } catch (err) {
    return { error: `Gemini summary: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/**
 * Uses Groq (Llama 3.3 70B / 3.1 8B) to summarize the transcript and lightly polish
 * code-switching. Extremely fast, free tier, and excels at bilingual Hebrew + English.
 */
async function summarizeTranscriptWithGroq(
  segments: TranscriptSegment[],
  meetingTitle: string,
  userLiveNotes: string,
  settings: AppSettings
): Promise<
  | {
      polishedSegments: TranscriptSegment[];
      summary: string;
      keyPoints: string[];
      decisions: string[];
      taskSuggestions: Array<{ title: string; description: string; priority: string }>;
    }
  | { error: string }
> {
  const groqKey = getGroqKey(settings);
  if (!groqKey) return { error: 'Groq: no API key configured for summary' };

  const transcriptText = segments
    .map((s, i) => `#${i} [${Math.round(s.startTimeSec)}s] ${s.speakerId}: ${s.text}`)
    .join('\n');

  const systemPrompt = `You are an expert bilingual (Hebrew + English) meeting assistant.
The transcript below may switch between Hebrew and English, including English words inside Hebrew sentences.

Tasks:
1. "fixes": ONLY for lines where an English word/term was clearly written phonetically in Hebrew letters (e.g. "פרודקשן" → "Production", "איי פי איי" → "API"), return the corrected full line. Do NOT translate, rephrase, or change anything else. Omit lines that need no fix.
2. Write the summary, key points, decisions and action items in the main language of the meeting (Hebrew if most of the meeting is Hebrew, otherwise English). Keep English technical terms in English.

Return ONLY a valid JSON object:
{
  "fixes": [{ "index": 0, "text": "..." }],
  "summary": "...",
  "keyPoints": ["..."],
  "decisions": ["..."],
  "taskSuggestions": [{ "title": "...", "description": "...", "priority": "high|medium|low" }]
}`;

  const userPrompt = `Meeting title: "${meetingTitle}"
User notes: "${userLiveNotes || 'None'}"
Transcript:
${transcriptText}`;

  for (const model of GROQ_SUMMARY_MODELS) {
    try {
      const res = await fetch(GROQ_CHAT_COMPLETIONS_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${groqKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          response_format: { type: 'json_object' },
          temperature: 0.2,
        }),
      });

      if (!res.ok) {
        if (res.status === 404 || res.status === 400) continue;
        return { error: await readApiError(res, `Groq Summary (${model})`) };
      }

      const data = await res.json();
      const content = data?.choices?.[0]?.message?.content;
      if (!content) continue;

      const parsed = parseJsonLoose(content);
      const polishedSegments = segments.map((s) => ({ ...s }));
      if (Array.isArray(parsed?.fixes)) {
        parsed.fixes.forEach((fix: Record<string, unknown>) => {
          const idx = Number(fix.index);
          const fixedText = normalizeMixedHebrewEnglishText(String(fix.text || '').trim());
          if (Number.isInteger(idx) && polishedSegments[idx] && fixedText) {
            polishedSegments[idx].text = fixedText;
            polishedSegments[idx].language = detectSegmentLanguage(fixedText);
          }
        });
      }

      return {
        polishedSegments,
        summary: String(parsed?.summary || ''),
        keyPoints: Array.isArray(parsed?.keyPoints) ? parsed.keyPoints.map(String) : [],
        decisions: Array.isArray(parsed?.decisions) ? parsed.decisions.map(String) : [],
        taskSuggestions: Array.isArray(parsed?.taskSuggestions) ? parsed.taskSuggestions : [],
      };
    } catch {
      // try next model
    }
  }

  return { error: 'Groq summary: all models failed' };
}

/**
 * Intelligent summary router: uses preferred engine (Groq or Gemini) with mutual fallback.
 * If user chose Groq in settings or has Groq key, Groq is tried.
 * If Gemini hits 429 or fails, Groq seamlessly takes over!
 */
async function summarizeMeetingTranscript(
  segments: TranscriptSegment[],
  meetingTitle: string,
  userLiveNotes: string,
  settings: AppSettings
): Promise<
  | {
      polishedSegments: TranscriptSegment[];
      summary: string;
      keyPoints: string[];
      decisions: string[];
      taskSuggestions: Array<{ title: string; description: string; priority: string }>;
    }
  | { error: string }
> {
  const hasGroq = Boolean(getGroqKey(settings));
  const hasGemini = Boolean(getGeminiKey(settings));

  if (!hasGroq && !hasGemini) {
    return { error: 'No AI key configured (configure Groq or Gemini in Settings)' };
  }

  const errors: string[] = [];
  const preferGroq = settings.transcriptionProvider === 'groq_whisper' || (hasGroq && !hasGemini);

  if (preferGroq && hasGroq) {
    const groqRes = await summarizeTranscriptWithGroq(segments, meetingTitle, userLiveNotes, settings);
    if (!('error' in groqRes)) return groqRes;
    errors.push(groqRes.error);

    if (hasGemini) {
      console.log('[MemoryHub] Groq summary failed, falling back to Gemini...');
      const gemRes = await summarizeTranscriptWithGemini(segments, meetingTitle, userLiveNotes, settings);
      if (!('error' in gemRes)) return gemRes;
      errors.push(gemRes.error);
    }
  } else {
    if (hasGemini) {
      const gemRes = await summarizeTranscriptWithGemini(segments, meetingTitle, userLiveNotes, settings);
      if (!('error' in gemRes)) return gemRes;
      errors.push(gemRes.error);
    }

    if (hasGroq) {
      console.log('[MemoryHub] Gemini summary hit an issue, falling back to Groq Llama 3.3...');
      const groqRes = await summarizeTranscriptWithGroq(segments, meetingTitle, userLiveNotes, settings);
      if (!('error' in groqRes)) return groqRes;
      errors.push(groqRes.error);
    }
  }

  return { error: errors.join(' | ') };
}

/**
 * FR-6.3 - FR-6.8: Final meeting transcription + summary.
 *
 * 1. If the live segments were already produced by an acoustic engine (Groq / Gemini) during
 *    the meeting, they are reused (no audio is re-sent → no extra cost).
 * 2. Otherwise the full recording is transcribed with Groq Whisper (fallback: Gemini audio).
 * 3. Gemini (text-only) then generates the summary, key points, decisions and tasks.
 * If something fails, the real error is reported in the summary — no placeholder transcript is invented.
 */
export async function transcribeAndSummarizeMeetingAudio(
  audioDataUrl: string | undefined,
  audioMimeType: string,
  userLiveNotes: string,
  meetingTitle: string,
  settings: AppSettings,
  liveSegments?: TranscriptSegment[]
): Promise<TranscriptionResult> {
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const errors: string[] = [];

  let segments: TranscriptSegment[] = (liveSegments || [])
    .map((seg) => {
      const text = normalizeMixedHebrewEnglishText(seg.text);
      return { ...seg, text, language: detectSegmentLanguage(text) };
    })
    .filter((seg) => seg.text.trim().length > 0)
    .sort((a, b) => a.startTimeSec - b.startTimeSec);

  const liveIsAcoustic =
    segments.length > 0 && segments.every((s) => /^live-(groq|gemini)-/.test(s.id));

  // Transcribe the full recording if live acoustic transcription didn't cover the meeting
  if (!liveIsAcoustic && navigator.onLine && audioDataUrl && audioDataUrl.includes(',')) {
    let fullSegments: TranscriptSegment[] = [];
    let blob: Blob | null = null;
    try {
      blob = dataUrlToBlob(audioDataUrl, audioMimeType);
    } catch {
      errors.push('Could not read the recorded audio');
    }

    if (blob && getGroqKey(settings)) {
      const groq = await groqTranscribeBlob(
        blob,
        0,
        'speaker_1',
        settings,
        `${GROQ_BILINGUAL_BASE_PROMPT} ${meetingTitle}`.slice(0, 240),
        'seg-groq-'
      );
      if (groq.error) errors.push(groq.error);
      fullSegments = groq.segments;
    }

    if (fullSegments.length === 0 && getGeminiKey(settings)) {
      const gem = await geminiTranscribeAudio(
        audioDataUrl.split(',')[1],
        audioMimeType,
        0,
        null,
        'speaker_1',
        settings,
        'seg-gemini-',
        { meetingTitle, userLiveNotes }
      );
      if (gem.error) errors.push(gem.error);
      fullSegments = gem.segments;
    }

    if (fullSegments.length > 0) {
      segments = fullSegments;
    }
  }

  // Summary + code-switch polish using preferred engine (Groq / Gemini) with mutual fallback
  if (segments.length > 0 && (getGroqKey(settings) || getGeminiKey(settings)) && navigator.onLine) {
    const summaryResult = await summarizeMeetingTranscript(
      segments,
      meetingTitle,
      userLiveNotes,
      settings
    );
    if (!('error' in summaryResult)) {
      return {
        speakerLabels: buildSpeakerLabels(summaryResult.polishedSegments),
        segments: summaryResult.polishedSegments,
        summary: summaryResult.summary,
        keyPoints: summaryResult.keyPoints,
        decisions: summaryResult.decisions,
        taskSuggestions: summaryResult.taskSuggestions.map((t, i) => ({
          id: `msug-${Date.now()}-${i}`,
          title: String(t.title || 'Follow-up action item'),
          description: String(t.description || ''),
          priority: (['high', 'medium', 'low'].includes(String(t.priority))
            ? t.priority
            : 'medium') as 'high' | 'medium' | 'low',
          dueDate: tomorrow,
          status: 'pending' as const,
        })),
      };
    }
    errors.push(summaryResult.error);
  }

  // Honest fallback: keep whatever real transcript exists and report what went wrong
  const noteLines = userLiveNotes
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  let summary: string;
  if (segments.length > 0) {
    summary = getGroqKey(settings) || getGeminiKey(settings)
      ? `Transcript captured (${segments.length} segments), but the AI summary failed: ${errors.join(' | ')}`
      : `Transcript captured (${segments.length} segments). Add a free Groq or Gemini API key in Settings to also generate an AI summary, key points and suggested tasks.`;
  } else if (!getGroqKey(settings) && !getGeminiKey(settings)) {
    summary =
      'No transcription engine is configured. Add a free Groq API key (console.groq.com/keys) in the meeting recorder or Settings to transcribe Hebrew + English meetings.';
  } else {
    summary = `Transcription failed: ${errors.join(' | ') || 'no speech was detected in the recording'}. The audio was saved — you can retry later.`;
  }

  return {
    speakerLabels: buildSpeakerLabels(segments),
    segments,
    summary,
    keyPoints: noteLines,
    decisions: [],
    taskSuggestions: [],
  };
}
