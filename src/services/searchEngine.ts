import {
  AgentSourceCitation,
  GmailMessage,
  WorkspaceState,
} from '../types/domain';

export interface SearchResultItem {
  id: string;
  itemType: 'project' | 'page' | 'task' | 'meeting' | 'file' | 'canvas' | 'email';
  projectId?: string;
  projectName?: string;
  title: string;
  snippet: string;
  score: number;
  updatedAt: string;
  excludedFromAgent?: boolean;
}

// Bilingual semantic expansion dictionary for local hybrid semantic search (FR-11.3)
const SEMANTIC_CONCEPTS: string[][] = [
  ['sync', 'firestore', 'firebase', 'offline', 'database', 'סנכרון', 'בסיס נתונים', 'אופליין', 'מכסה', 'quota'],
  ['meeting', 'transcript', 'audio', 'speaker', 'record', 'פגישה', 'תמלול', 'הקלטה', 'דובר', 'דוברים', 'סיכום'],
  ['task', 'todo', 'deadline', 'due', 'priority', 'משימה', 'משימות', 'יעד', 'תאריך', 'דחוף'],
  ['widget', 'android', 'voice', 'shortcut', 'ווידג׳ט', 'אנדרואיד', 'קולי', 'הוספה מהירה'],
  ['file', 'pdf', 'ocr', 'image', 'drive', 'קובץ', 'קבצים', 'תמונה', 'דרייב', 'סריקה'],
  ['canvas', 'diagram', 'flow', 'shape', 'miro', 'קנבס', 'תרשים', 'לוח'],
  ['email', 'gmail', 'calendar', 'routine', 'מייל', 'אימייל', 'יומן', 'רוטינה', 'אוטומציה'],
];

function normalizeToken(token: string): string {
  const clean = token.toLowerCase().replace(/[^\w\u0590-\u05FF]/g, '');
  // Strip common single-letter Hebrew prefixes (ה, ו, ב, ל, מ, ש, כ) when word is >= 4 chars
  if (clean.length >= 4 && /^[\u0590-\u05FF]+$/.test(clean)) {
    if (/^[הובלמשכ]/.test(clean)) {
      return clean.slice(1);
    }
  }
  return clean;
}

function expandSemanticTerms(tokens: string[], enableSemantic: boolean): Set<string> {
  const expanded = new Set<string>(tokens);
  if (!enableSemantic) return expanded;

  for (const token of tokens) {
    for (const cluster of SEMANTIC_CONCEPTS) {
      if (cluster.some((c) => c.includes(token) || token.includes(c))) {
        for (const synonym of cluster) {
          expanded.add(synonym.toLowerCase());
        }
      }
    }
  }
  return expanded;
}

/**
 * FR-9.2: Enforces that only emails matching the user's Allowed Labels or Allowed Senders are ever read.
 */
export function isEmailAllowedByPolicy(
  email: GmailMessage,
  allowedLabels: string[],
  allowedSenders: string[]
): boolean {
  const normLabels = allowedLabels.map((l) => l.trim().toLowerCase()).filter(Boolean);
  const normSenders = allowedSenders.map((s) => s.trim().toLowerCase()).filter(Boolean);

  if (normLabels.length === 0 && normSenders.length === 0) {
    return false;
  }

  const labelMatch = email.labels.some((lbl) => normLabels.includes(lbl.toLowerCase()));
  const senderMatch = normSenders.some((allowed) => {
    const emailAddr = email.fromEmail.toLowerCase();
    if (allowed.startsWith('*@')) {
      return emailAddr.endsWith(allowed.slice(1));
    }
    return emailAddr === allowed || emailAddr.includes(allowed);
  });

  return labelMatch || senderMatch;
}

export interface SearchOptions {
  query: string;
  projectIdFilter?: string | null;
  typeFilter?: SearchResultItem['itemType'] | 'all';
  forAgent?: boolean; // Strictly filters out projects with excludeFromAgent === true
  semantic?: boolean;
  limit?: number;
}

export function searchWorkspace(
  state: WorkspaceState,
  options: SearchOptions
): SearchResultItem[] {
  const rawQuery = options.query.trim();
  const rawTokens = rawQuery
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  const normalizedTokens = rawTokens.map(normalizeToken).filter(Boolean);
  const expandedTerms = expandSemanticTerms(
    normalizedTokens,
    options.semantic ?? state.settings.semanticSearchEnabled
  );

  const projectMap = new Map(state.projects.filter((p) => !p.isDeleted).map((p) => [p.id, p]));
  const results: SearchResultItem[] = [];

  const isProjectAllowed = (projectId?: string): boolean => {
    if (!projectId) return true;
    const proj = projectMap.get(projectId);
    if (!proj || proj.isDeleted) return false;
    if (options.projectIdFilter && proj.id !== options.projectIdFilter) return false;
    if (options.forAgent && proj.excludeFromAgent) return false; // FR-1.6
    return true;
  };

  const computeScore = (title: string, body: string): { score: number; snippet: string } => {
    if (!rawQuery) {
      return { score: 1, snippet: body.slice(0, 180) };
    }
    const lowerTitle = title.toLowerCase();
    const lowerBody = body.toLowerCase();
    let score = 0;

    if (lowerTitle.includes(rawQuery.toLowerCase())) score += 25;
    if (lowerBody.includes(rawQuery.toLowerCase())) score += 15;

    for (const tok of rawTokens) {
      if (lowerTitle.includes(tok)) score += 10;
      if (lowerBody.includes(tok)) score += 6;
    }

    for (const normTok of normalizedTokens) {
      if (normTok.length >= 2) {
        if (lowerTitle.includes(normTok)) score += 6;
        if (lowerBody.includes(normTok)) score += 4;
      }
    }

    // Semantic expansion hits (FR-11.3)
    if (options.semantic ?? state.settings.semanticSearchEnabled) {
      for (const semTerm of expandedTerms) {
        if (!rawTokens.includes(semTerm)) {
          if (lowerTitle.includes(semTerm)) score += 2.5;
          if (lowerBody.includes(semTerm)) score += 1.5;
        }
      }
    }

    if (score === 0) return { score: 0, snippet: '' };

    // Extract best matching snippet window
    let matchIndex = lowerBody.indexOf(rawQuery.toLowerCase());
    if (matchIndex === -1 && rawTokens.length > 0) {
      for (const tok of rawTokens) {
        const idx = lowerBody.indexOf(tok);
        if (idx !== -1) {
          matchIndex = idx;
          break;
        }
      }
    }

    const start = Math.max(0, (matchIndex === -1 ? 0 : matchIndex) - 45);
    const snippet =
      (start > 0 ? '...' : '') +
      body.slice(start, start + 190).replace(/\n+/g, ' ') +
      (start + 190 < body.length ? '...' : '');

    return { score, snippet };
  };

  // 1. Pages & Blocks (including Simple Tables)
  if (!options.typeFilter || options.typeFilter === 'all' || options.typeFilter === 'page') {
    for (const page of state.pages) {
      if (page.isDeleted || !isProjectAllowed(page.projectId)) continue;
      const proj = projectMap.get(page.projectId);
      const blockTexts = page.blocks
        .map((b) => {
          if (b.type === 'simple_table' && b.tableData) {
            const headers = b.tableData.headers.join(' | ');
            const rows = b.tableData.rows.map((r) => r.join(' | ')).join(' ; ');
            return `${b.content} ${headers} ${rows}`;
          }
          return b.content;
        })
        .join(' \n ');
      const { score, snippet } = computeScore(page.title, blockTexts);
      if (score > 0) {
        results.push({
          id: page.id,
          itemType: 'page',
          projectId: page.projectId,
          projectName: proj?.name,
          title: `${page.icon || '📄'} ${page.title}`,
          snippet: snippet || blockTexts.slice(0, 160),
          score,
          updatedAt: page.updatedAt,
          excludedFromAgent: proj?.excludeFromAgent,
        });
      }
    }
  }

  // 2. Tasks
  if (!options.typeFilter || options.typeFilter === 'all' || options.typeFilter === 'task') {
    for (const task of state.tasks) {
      if (task.isDeleted || !isProjectAllowed(task.projectId)) continue;
      const proj = projectMap.get(task.projectId);
      const tagNames = state.tags
        .filter((tg) => task.tagIds.includes(tg.id))
        .map((tg) => tg.name)
        .join(', ');
      const body = `${task.description} ${tagNames} Due: ${task.dueDate || 'none'} Priority: ${task.priority}`;
      const { score, snippet } = computeScore(task.title, body);
      if (score > 0) {
        results.push({
          id: task.id,
          itemType: 'task',
          projectId: task.projectId,
          projectName: proj?.name,
          title: task.title,
          snippet: snippet || body,
          score,
          updatedAt: task.updatedAt,
          excludedFromAgent: proj?.excludeFromAgent,
        });
      }
    }
  }

  // 3. Meeting Notes & Transcripts (FR-6.10, FR-11.2)
  if (!options.typeFilter || options.typeFilter === 'all' || options.typeFilter === 'meeting') {
    for (const meeting of state.meetings) {
      if (meeting.isDeleted || !isProjectAllowed(meeting.projectId)) continue;
      const proj = projectMap.get(meeting.projectId);
      const transcriptText = meeting.segments
        .map((s) => `${meeting.speakerLabels[s.speakerId] || s.speakerId}: ${s.text}`)
        .join(' ');
      const body = `${meeting.summary} ${meeting.keyPoints.join(' ')} ${meeting.decisions.join(' ')} ${meeting.userLiveNotes} ${transcriptText}`;
      const { score, snippet } = computeScore(meeting.title, body);
      if (score > 0) {
        results.push({
          id: meeting.id,
          itemType: 'meeting',
          projectId: meeting.projectId,
          projectName: proj?.name,
          title: `🎙️ ${meeting.title}`,
          snippet: snippet || meeting.summary.slice(0, 170),
          score,
          updatedAt: meeting.updatedAt,
          excludedFromAgent: proj?.excludeFromAgent,
        });
      }
    }
  }

  // 4. Files (PDF Extracted Text & Image OCR — FR-4.3, FR-11.2)
  if (!options.typeFilter || options.typeFilter === 'all' || options.typeFilter === 'file') {
    for (const file of state.files) {
      if (file.isDeleted || !isProjectAllowed(file.projectId)) continue;
      const proj = projectMap.get(file.projectId);
      const { score, snippet } = computeScore(file.name, file.extractedText || '');
      if (score > 0) {
        results.push({
          id: file.id,
          itemType: 'file',
          projectId: file.projectId,
          projectName: proj?.name,
          title: `📎 ${file.name}`,
          snippet: snippet || file.extractedText.slice(0, 170),
          score,
          updatedAt: file.updatedAt,
          excludedFromAgent: proj?.excludeFromAgent,
        });
      }
    }
  }

  // 5. Canvases
  if (!options.typeFilter || options.typeFilter === 'all' || options.typeFilter === 'canvas') {
    for (const canvas of state.canvases) {
      if (canvas.isDeleted || !isProjectAllowed(canvas.projectId)) continue;
      const proj = projectMap.get(canvas.projectId);
      const body = canvas.nodes.map((n) => n.text).join(' | ');
      const { score, snippet } = computeScore(canvas.title, body);
      if (score > 0) {
        results.push({
          id: canvas.id,
          itemType: 'canvas',
          projectId: canvas.projectId,
          projectName: proj?.name,
          title: `🎨 ${canvas.title}`,
          snippet: snippet || body.slice(0, 160),
          score,
          updatedAt: canvas.updatedAt,
          excludedFromAgent: proj?.excludeFromAgent,
        });
      }
    }
  }

  // 6. Allowed Gmail Messages (FR-9.2)
  if (!options.typeFilter || options.typeFilter === 'all' || options.typeFilter === 'email') {
    const { allowedLabels, allowedSenders } = state.settings.gmailAllowlist;
    for (const email of state.gmailMessages) {
      if (!isEmailAllowedByPolicy(email, allowedLabels, allowedSenders)) continue;
      const body = `From: ${email.fromName} <${email.fromEmail}> Labels: ${email.labels.join(', ')} ${email.bodyText}`;
      const { score, snippet } = computeScore(email.subject, body);
      if (score > 0) {
        results.push({
          id: email.id,
          itemType: 'email',
          title: `✉️ ${email.subject}`,
          snippet: snippet || email.snippet,
          score,
          updatedAt: email.receivedAt,
        });
      }
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, options.limit || 25);
}

/**
 * FR-7.13: Retrieves only relevant snippets (not the whole database) for the AI Agent,
 * strictly excluding projects with excludeFromAgent === true.
 */
export function retrieveRelevantSnippetsForAgent(
  state: WorkspaceState,
  userPrompt: string,
  scopeProjectId: string | null
): AgentSourceCitation[] {
  const hits = searchWorkspace(state, {
    query: userPrompt,
    projectIdFilter: scopeProjectId,
    forAgent: true,
    semantic: true,
    limit: 8,
  });

  // If the user asks a broad question (e.g., "Summarize my workspace" or "מה המשימות שלי היום?"),
  // also include top recent allowed items so the agent has grounded context.
  if (hits.length < 4) {
    const fallbackHits = searchWorkspace(state, {
      query: '',
      projectIdFilter: scopeProjectId,
      forAgent: true,
      semantic: true,
      limit: 6,
    });
    for (const fh of fallbackHits) {
      if (!hits.some((h) => h.id === fh.id && h.itemType === fh.itemType)) {
        hits.push(fh);
      }
    }
  }

  return hits
    .filter((h) => h.itemType !== 'project')
    .slice(0, 8)
    .map((h) => ({
      id: `cit-${h.itemType}-${h.id}`,
      itemType: h.itemType as AgentSourceCitation['itemType'],
      itemId: h.id,
      projectId: h.projectId,
      title: h.title,
      snippet: h.snippet,
      score: h.score,
    }));
}
