import {
  AIProviderId,
  AgentDiffBlockChange,
  AgentEditProposal,
  AgentMessage,
  AgentSourceCitation,
  PageDocument,
  PriorityLevel,
  WorkspaceState,
} from '../types/domain';
import { retrieveRelevantSnippetsForAgent } from './searchEngine';
import { callGeminiGenerateContent } from './mediaAiService';

export const AVAILABLE_AI_MODELS: Array<{
  provider: AIProviderId;
  modelId: string;
  label: string;
}> = [
  { provider: 'gemini', modelId: 'gemini-2.0-flash', label: 'Google Gemini 2.0 Flash' },
  { provider: 'gemini', modelId: 'gemini-1.5-flash', label: 'Google Gemini 1.5 Flash' },
  { provider: 'gemini', modelId: 'gemini-3.8-flash', label: 'Google Gemini 3.8 Flash' },
  { provider: 'gemini', modelId: 'gemini-2.5-pro', label: 'Google Gemini 2.5 Pro' },
  { provider: 'gemini', modelId: 'gemini-2.5-flash', label: 'Google Gemini 2.5 Flash' },
  { provider: 'claude', modelId: 'claude-3-7-sonnet-latest', label: 'Anthropic Claude 3.7 Sonnet' },
  { provider: 'claude', modelId: 'claude-3-5-haiku-latest', label: 'Anthropic Claude 3.5 Haiku' },
  { provider: 'openai', modelId: 'gpt-4o', label: 'OpenAI GPT-4o' },
  { provider: 'openai', modelId: 'gpt-4o-mini', label: 'OpenAI GPT-4o Mini' },
];

export interface AgentTurnResult {
  assistantMessage: AgentMessage;
  createdTasks: Array<{
    title: string;
    description: string;
    priority: PriorityLevel;
    dueDate?: string;
    projectId: string;
    syncToGoogleCalendar?: boolean;
  }>;
  createdPages: Array<{
    title: string;
    projectId: string;
    initialParagraphs: string[];
  }>;
  editProposals: AgentEditProposal[];
}

function buildSystemPrompt(
  citations: AgentSourceCitation[],
  allowedProjectNames: string[],
  excludedProjectNames: string[]
): string {
  const snippetContext = citations
    .map(
      (c, i) =>
        `[Source ${i + 1}] (${c.itemType.toUpperCase()} — "${c.title}", ID: ${c.itemId}):\n${c.snippet}`
    )
    .join('\n\n');

  return `You are the Memory Hub Personal AI Agent (running on Windows & Android).
You assist a single user working in Hebrew (RTL) and English (LTR).
Respond in the same language as the user's question (Hebrew or English).

STRICT RULES (PRD Section 8):
1. NEVER delete anything yourself. If the user asks to delete an item, explain that by security policy only the user can delete items, and provide a deletionSuggestion object.
2. NEVER directly overwrite existing pages or tasks. Always return an editProposal so the user can review a side-by-side before/after diff.
3. Allowed Projects: ${allowedProjectNames.join(', ')}.
4. Excluded Projects (Strictly off-limits): ${excludedProjectNames.join(', ') || 'None'}.

RETRIEVED WORKSPACE SNIPPETS (FR-7.13):
${snippetContext || 'No matching snippets found.'}

Return a JSON object with:
{
  "reply": "Markdown response referencing sources used",
  "createTasks": [{ "title": "...", "description": "...", "priority": "medium|high|low", "dueDate": "YYYY-MM-DD" }],
  "createPages": [{ "title": "...", "paragraphs": ["..."] }],
  "proposePageEdit": { "pageId": "...", "summary": "...", "updatedBlockText": "...", "addedBlockText": "..." } | null,
  "deletionSuggestion": { "itemType": "task|page|file", "itemId": "...", "itemTitle": "...", "reason": "..." } | null
}`;
}

async function callCloudModelProvider(
  provider: AIProviderId,
  modelId: string,
  apiKey: string,
  systemPrompt: string,
  userPrompt: string
): Promise<string | null> {
  if (!apiKey || !navigator.onLine) return null;

  try {
    if (provider === 'gemini') {
      const result = await callGeminiGenerateContent(apiKey, {
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.2 },
      });
      if (result.ok && result.data) {
        return result.data?.candidates?.[0]?.content?.parts?.[0]?.text || null;
      }
      return null;
    }

    if (provider === 'openai') {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: modelId,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.2,
        }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      return data?.choices?.[0]?.message?.content || null;
    }

    if (provider === 'claude') {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: modelId,
          max_tokens: 1500,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
        }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      return data?.content?.[0]?.text || null;
    }
  } catch {
    return null;
  }
  return null;
}

export async function runAgentTurn(
  state: WorkspaceState,
  userPrompt: string,
  scopeProjectId: string | null
): Promise<AgentTurnResult> {
  const isHebrew = /[\u0590-\u05FF]/.test(userPrompt);
  const citations = retrieveRelevantSnippetsForAgent(state, userPrompt, scopeProjectId);

  const allowedProjects = state.projects.filter((p) => !p.isDeleted && !p.excludeFromAgent);
  const excludedProjects = state.projects.filter((p) => !p.isDeleted && p.excludeFromAgent);
  const defaultProjectId =
    scopeProjectId && allowedProjects.some((p) => p.id === scopeProjectId)
      ? scopeProjectId
      : allowedProjects[0]?.id || 'proj-product-2026';

  const { selectedProvider, selectedModelId, apiKeys } = state.settings;
  const activeKey = apiKeys[selectedProvider] || '';

  const systemPrompt = buildSystemPrompt(
    citations,
    allowedProjects.map((p) => p.name),
    excludedProjects.map((p) => p.name)
  );

  const cloudRaw = await callCloudModelProvider(
    selectedProvider,
    selectedModelId,
    activeKey,
    systemPrompt,
    userPrompt
  );

  const createdTasks: AgentTurnResult['createdTasks'] = [];
  const createdPages: AgentTurnResult['createdPages'] = [];
  const editProposals: AgentEditProposal[] = [];
  let replyContent = '';
  let deletionSuggestion: AgentMessage['deletionSuggestion'] | undefined;

  if (cloudRaw) {
    try {
      const parsed = JSON.parse(cloudRaw);
      replyContent = parsed.reply || cloudRaw;
      if (Array.isArray(parsed.createTasks)) {
        for (const ct of parsed.createTasks) {
          if (ct?.title) {
            createdTasks.push({
              title: ct.title,
              description: ct.description || '',
              priority: ct.priority || 'medium',
              dueDate: ct.dueDate,
              projectId: defaultProjectId,
            });
          }
        }
      }
      if (Array.isArray(parsed.createPages)) {
        for (const cp of parsed.createPages) {
          if (cp?.title) {
            createdPages.push({
              title: cp.title,
              projectId: defaultProjectId,
              initialParagraphs: Array.isArray(cp.paragraphs) ? cp.paragraphs : [cp.content || ''],
            });
          }
        }
      }
      if (parsed.deletionSuggestion?.itemTitle) {
        deletionSuggestion = {
          itemType: parsed.deletionSuggestion.itemType || 'task',
          itemId: parsed.deletionSuggestion.itemId || '',
          itemTitle: parsed.deletionSuggestion.itemTitle,
          reason: parsed.deletionSuggestion.reason || 'Suggested by AI Agent based on your prompt',
        };
      }
    } catch {
      replyContent = cloudRaw;
    }
  }

  // Deterministic local intent & RAG execution when offline or no API key is configured yet
  if (!replyContent) {
    const lower = userPrompt.toLowerCase();

    // 1. Check if user asked to DELETE something (FR-7.10 guardrail)
    if (
      lower.includes('delete') ||
      lower.includes('remove') ||
      userPrompt.includes('מחק') ||
      userPrompt.includes('למחוק')
    ) {
      const targetTask = state.tasks.find((t) => !t.isDeleted);
      deletionSuggestion = {
        itemType: 'task',
        itemId: targetTask?.id || 'task-1',
        itemTitle: targetTask?.title || 'Selected Workspace Item',
        reason: isHebrew
          ? 'המשתמש ביקש מחיקה. לפי כללי הבטיחות (FR-7.10), הסוכן אינו רשאי למחוק פריטים בעצמו אלא רק להציע מחיקה לאישורך.'
          : 'Requested by user. Per FR-7.10 safety rules, the AI agent can never delete anything by itself — click Confirm below if you want to move it to Trash.',
      };
      replyContent = isHebrew
        ? `⚠️ **כלל בטיחות (FR-7.10):** אינני רשאי למחוק שום פריט בעצמי.\n\nהכנתי עבורך כרטיס **הצעת מחיקה** למטה — באפשרותך לאשר ולהעביר את הפריט לסל המחזור בלחיצה ידנית.`
        : `⚠️ **Safety Rule (FR-7.10):** I am strictly prohibited from deleting any item by myself.\n\nI have attached a **Deletion Suggestion** below so you can manually confirm moving it to Trash if desired.`;
    }
    // 2. Check if user asked to EDIT / REWRITE / UPDATE an existing page (FR-7.8, FR-7.9)
    else if (
      lower.includes('edit') ||
      lower.includes('rewrite') ||
      lower.includes('improve') ||
      lower.includes('update page') ||
      userPrompt.includes('ערוך') ||
      userPrompt.includes('לערוך') ||
      userPrompt.includes('שפר') ||
      userPrompt.includes('עדכן את הדף')
    ) {
      const targetPage: PageDocument | undefined =
        state.pages.find(
          (p) => !p.isDeleted && (!scopeProjectId || p.projectId === scopeProjectId)
        ) || state.pages.find((p) => !p.isDeleted);

      if (targetPage) {
        const firstBlock = targetPage.blocks[0];
        const blockChanges: AgentDiffBlockChange[] = [];
        if (firstBlock) {
          blockChanges.push({
            blockId: firstBlock.id,
            changeType: 'modified',
            beforeText: firstBlock.content,
            afterText: isHebrew
              ? `${firstBlock.content} — (עודכן ושופר ע״י סוכן AI)`
              : `${firstBlock.content} — (Refined & Expanded by AI Agent)`,
            beforeBlock: firstBlock,
            afterBlock: {
              ...firstBlock,
              content: isHebrew
                ? `${firstBlock.content} — (עודכן ושופר ע״י סוכן AI)`
                : `${firstBlock.content} — (Refined & Expanded by AI Agent)`,
              updatedAt: new Date().toISOString(),
            },
            accepted: true,
          });
        }
        const newBlockId = `blk-agent-${Date.now()}`;
        const addedText = isHebrew
          ? `📌 תוספת סוכן AI: סיכום נקודות מרכזיות מתוך הפרויקט עבור "${userPrompt}".`
          : `📌 AI Agent Addition: Synthesized key action points and architectural notes for "${userPrompt}".`;

        blockChanges.push({
          blockId: newBlockId,
          changeType: 'added',
          beforeText: '',
          afterText: addedText,
          afterBlock: {
            id: newBlockId,
            type: 'callout',
            content: addedText,
            dir: isHebrew ? 'rtl' : 'ltr',
            updatedAt: new Date().toISOString(),
          },
          accepted: true,
        });

        const proposal: AgentEditProposal = {
          id: `prop-${Date.now()}`,
          targetType: 'page',
          targetId: targetPage.id,
          targetTitle: targetPage.title,
          projectId: targetPage.projectId,
          summaryOfChanges: isHebrew
            ? `הצעת עריכה לדף "${targetPage.title}" בעקבות בקשתך`
            : `Proposed edit to "${targetPage.title}" based on your request`,
          createdAt: new Date().toISOString(),
          origin: 'chat',
          status: 'pending',
          blockChanges,
        };
        editProposals.push(proposal);

        replyContent = isHebrew
          ? `הכנתי **הצעת עריכה (Diff Review)** עבור הדף **"${targetPage.title}"**.\n\nלפי דרישה **FR-7.9**, שום דבר אינו משתנה בדף עד שתבדוק את ההשוואה (לפני מול אחרי) ותבחר **אשר הכל**, **אשר חלקית**, או **דחה**.`
          : `I have prepared a **Side-by-Side Diff Proposal** for **"${targetPage.title}"**.\n\nPer **FR-7.9**, nothing in your page is modified until you review the highlighted before/after changes below and choose **Accept All**, **Accept Selected Blocks**, or **Reject**.`;
      }
    }
    // 3. Check if user asked to CREATE A TASK (FR-7.5)
    else if (
      lower.includes('create task') ||
      lower.includes('add task') ||
      lower.includes('new task') ||
      userPrompt.includes('צור משימה') ||
      userPrompt.includes('הוסף משימה') ||
      userPrompt.includes('משימה חדשה')
    ) {
      const cleanedTitle = userPrompt
        .replace(/^(create|add|make)\s+(a\s+)?task\s*(to|for|:)?\s*/i, '')
        .replace(/^(צור|הוסף)\s+משימה\s*(חדשה)?\s*(:|ל)?\s*/i, '')
        .trim();
      const taskTitle =
        cleanedTitle ||
        (isHebrew ? 'משימה חדשה שנוצרה ע״י סוכן ה-AI' : 'Follow up on workspace action items');

      const syncCalendar =
        lower.includes('calendar') || userPrompt.includes('יומן') || userPrompt.includes('קלנדר');

      createdTasks.push({
        title: taskTitle,
        description: isHebrew
          ? `נוצר ע״י סוכן ה-AI מתוך בקשה: "${userPrompt}"`
          : `Created by AI Agent from prompt: "${userPrompt}"`,
        priority: 'high',
        dueDate: new Date().toISOString().slice(0, 10),
        projectId: defaultProjectId,
        syncToGoogleCalendar: syncCalendar,
      });

      replyContent = isHebrew
        ? `✅ יצרתי משימה חדשה: **"${taskTitle}"** וסימנתי אותה כ-**נוצר ע״י סוכן AI**${
            syncCalendar ? ' (כולל סנכרון ל-Google Calendar)' : ''
          }.`
        : `✅ I created the task **"${taskTitle}"** in your project and linked its source badge to **AI Agent**${
            syncCalendar ? ' (and synced it to Google Calendar)' : ''
          }.`;
    }
    // 4. Check if user asked to CREATE A PAGE (FR-7.6)
    else if (
      lower.includes('create page') ||
      lower.includes('new page') ||
      userPrompt.includes('צור דף') ||
      userPrompt.includes('דף חדש')
    ) {
      const pageTitle =
        userPrompt
          .replace(/^(create|add|make)\s+(a\s+)?(new\s+)?page\s*(about|for|:)?\s*/i, '')
          .replace(/^(צור|הוסף)\s+דף\s*(חדש)?\s*(:|על)?\s*/i, '')
          .trim() || (isHebrew ? 'מסמך סיכום חדש (AI)' : 'AI Generated Project Note');

      createdPages.push({
        title: pageTitle,
        projectId: defaultProjectId,
        initialParagraphs: [
          isHebrew
            ? `דף זה נוצר אוטומטית על ידי סוכן ה-AI של Memory Hub בתגובה לבקשה: "${userPrompt}".`
            : `This page was created by the Memory Hub AI Agent in response to: "${userPrompt}".`,
          ...citations.slice(0, 3).map((c) => `• ${c.title}: ${c.snippet}`),
        ],
      });

      replyContent = isHebrew
        ? `📄 יצרתי דף חדש בשם **"${pageTitle}"** בתוך הפרויקט שלך על בסיס המקורות שאותרו.`
        : `📄 I created a new page titled **"${pageTitle}"** inside your project with synthesized notes from your workspace.`;
    }
    // 5. General Q&A / Summary across stored data with citations (FR-7.2, FR-7.3, FR-7.4)
    else {
      const openTasksCount = state.tasks.filter((t) => !t.isDeleted && !t.completed).length;
      const snippetBullets = citations
        .slice(0, 4)
        .map((c) => `- **${c.title}** *(${c.itemType})*: ${c.snippet}`)
        .join('\n');

      replyContent = isHebrew
        ? `להלן התשובה המבוססת על חיפוש בפרויקטים המורשים שלך (${citations.length} מקורות נמצאו, ${openTasksCount} משימות פתוחות כעת):\n\n${snippetBullets}\n\n*הערת פרטיות:* פרויקטים המסומנים כ-"החרג מסוכן AI" (${excludedProjects
            .map((p) => p.name)
            .join(', ')}) לא נסרקו ולא נשלחו.`
        : `Here is what I found across your allowed workspace projects (${citations.length} relevant sources retrieved, ${openTasksCount} open tasks active):\n\n${snippetBullets}\n\n*Privacy & Scope:* Only relevant snippets were retrieved (FR-7.13), and excluded projects (${excludedProjects
            .map((p) => p.name)
            .join(', ')}) were strictly omitted.`;
    }
  }

  const assistantMessage: AgentMessage = {
    id: `msg-${Date.now()}`,
    role: 'assistant',
    content: replyContent,
    timestamp: new Date().toISOString(),
    modelUsed: `${selectedProvider}:${selectedModelId}`,
    citations,
    editProposalIds: editProposals.map((ep) => ep.id),
    deletionSuggestion,
  };

  return {
    assistantMessage,
    createdTasks,
    createdPages,
    editProposals,
  };
}
