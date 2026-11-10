import React, { useState, useRef, useMemo } from 'react';
import {
  Sparkles,
  Send,
  Mic,
  MicOff,
  ShieldAlert,
  ExternalLink,
  Plus,
  Trash2,
  CheckCircle2,
  Bot,
  User,
  Lock,
  GitCompare,
  RotateCcw,
} from 'lucide-react';
import { AIProviderId } from '../types/domain';
import { useWorkspace } from '../context/WorkspaceContext';
import { detectTextDirection, useTranslations } from '../i18n/translations';
import { DiffReviewCard } from './DiffReviewCard';

interface AgentWorkspaceViewProps {
  mode?: 'chat' | 'review-inbox';
}

const PROVIDER_MODELS: Record<AIProviderId, { label: string; models: string[] }> = {
  gemini: {
    label: 'Google Gemini',
    models: ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-3.8-flash', 'gemini-2.5-pro', 'gemini-2.5-flash'],
  },
  claude: {
    label: 'Anthropic Claude',
    models: ['claude-3-7-sonnet', 'claude-3-5-haiku'],
  },
  openai: {
    label: 'OpenAI GPT',
    models: ['gpt-4o', 'gpt-4o-mini'],
  },
};

export const AgentWorkspaceView: React.FC<AgentWorkspaceViewProps> = ({ mode = 'chat' }) => {
  const {
    state,
    sendAgentPrompt,
    createNewConversation,
    clearConversationMessages,
    applyEditProposalDecision,
    updateSettings,
    navigateToItem,
    deleteTaskToTrash,
    deletePageToTrash,
    deleteFileToTrash,
    deleteMeetingToTrash,
    deleteCanvasToTrash,
  } = useWorkspace();
  const t = useTranslations(state.settings.language);

  const [selectedConvId, setSelectedConvId] = useState<string>(
    state.conversations[0]?.id || 'conv-main'
  );
  const [scopeProjectId, setScopeProjectId] = useState<string | null>(null);
  const [promptInput, setPromptInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isListeningVoice, setIsListeningVoice] = useState(false);
  const [voiceLang, setVoiceLang] = useState<'he-IL' | 'en-US'>(
    state.settings.language === 'he' ? 'he-IL' : 'en-US'
  );

  const recognitionRef = useRef<any>(null);

  const activeConversation = useMemo(
    () =>
      state.conversations.find((c) => c.id === selectedConvId) || state.conversations[0],
    [state.conversations, selectedConvId]
  );

  const excludedProjects = useMemo(
    () => state.projects.filter((p) => !p.isDeleted && p.excludeFromAgent),
    [state.projects]
  );

  const allowedProjects = useMemo(
    () => state.projects.filter((p) => !p.isDeleted && !p.excludeFromAgent),
    [state.projects]
  );

  const handleSend = async (customPrompt?: string) => {
    const text = (customPrompt ?? promptInput).trim();
    if (!text || !activeConversation) return;
    setPromptInput('');
    setIsSending(true);
    await sendAgentPrompt(text, activeConversation.id, scopeProjectId);
    setIsSending(false);
  };

  // FR-7.14: Voice-to-Text Input in Hebrew & English
  const toggleVoiceDictation = () => {
    if (isListeningVoice) {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {
          // ignore
        }
      }
      setIsListeningVoice(false);
      return;
    }

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.lang = voiceLang;
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
      recognition.onresult = (event: any) => {
        const transcript = event.results?.[0]?.[0]?.transcript || '';
        if (transcript) {
          setPromptInput((prev) => (prev ? `${prev} ${transcript}` : transcript));
        }
        setIsListeningVoice(false);
      };
      recognition.onerror = () => {
        setIsListeningVoice(false);
      };
      recognition.onend = () => {
        setIsListeningVoice(false);
      };
      recognitionRef.current = recognition;
      setIsListeningVoice(true);
      recognition.start();
    } else {
      // Fallback sample dictation when browser SpeechRecognition API is unavailable
      setIsListeningVoice(true);
      window.setTimeout(() => {
        const sample =
          voiceLang === 'he-IL'
            ? 'סכם לי את הפגישה האחרונה ותציע משימות חדשות לפרויקט'
            : 'Summarize the latest architecture page and propose an edit adding a security checklist';
        setPromptInput((prev) => (prev ? `${prev} ${sample}` : sample));
        setIsListeningVoice(false);
      }, 1200);
    }
  };

  // Dedicated Review Inbox Mode (FR-10.6 & FR-7.9)
  if (mode === 'review-inbox') {
    const pendingProposals = state.editProposals.filter((p) => p.status === 'pending');
    const resolvedProposals = state.editProposals.filter((p) => p.status !== 'pending');

    return (
      <div className="space-y-6">
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <GitCompare className="w-5 h-5 text-indigo-600" />
              {t.nav.reviewInbox} ({pendingProposals.length} Pending)
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Every edit proposed by the AI Agent or background Routines waits here for your side-by-side before/after approval (FR-7.9, FR-10.6).
            </p>
          </div>
        </div>

        {pendingProposals.length === 0 ? (
          <div className="p-10 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center text-slate-500 text-sm">
            🎉 No pending agent edit proposals! You can ask the AI Agent to edit any page or run a Routine to generate a new diff proposal.
          </div>
        ) : (
          <div className="space-y-4">
            {pendingProposals.map((prop) => (
              <DiffReviewCard key={prop.id} proposal={prop} />
            ))}
          </div>
        )}

        {resolvedProposals.length > 0 && (
          <div className="space-y-3 pt-4 border-t border-slate-200 dark:border-slate-800">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Resolved Edit Proposals History ({resolvedProposals.length})
            </h3>
            {resolvedProposals.map((prop) => (
              <DiffReviewCard key={prop.id} proposal={prop} />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 h-[calc(100vh-11rem)] min-h-[580px]">
      {/* Left Sidebar: Conversations, Model Switcher & Privacy Gatekeeper Status */}
      <div className="lg:col-span-4 flex flex-col gap-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 overflow-y-auto">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-indigo-600" />
            {t.agent.title}
          </h3>
          <button
            onClick={() => {
              const created = createNewConversation(scopeProjectId);
              setSelectedConvId(created.id);
            }}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-700"
          >
            <Plus className="w-3.5 h-3.5" /> New Chat
          </button>
        </div>

        {/* Switchable AI Provider & Model (FR-7.1) */}
        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2">
          <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">
            AI Provider & Model (FR-7.1)
          </label>
          <div className="grid grid-cols-3 gap-1">
            {(['gemini', 'claude', 'openai'] as AIProviderId[]).map((prov) => (
              <button
                key={prov}
                onClick={() =>
                  updateSettings({
                    selectedProvider: prov,
                    selectedModelId: PROVIDER_MODELS[prov].models[0],
                  })
                }
                className={`py-1.5 px-2 rounded-lg text-xs font-semibold capitalize transition ${
                  state.settings.selectedProvider === prov
                    ? 'bg-indigo-600 text-white shadow-2xs'
                    : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                }`}
              >
                {prov}
              </button>
            ))}
          </div>
          <select
            value={state.settings.selectedModelId}
            onChange={(e) => updateSettings({ selectedModelId: e.target.value })}
            className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
          >
            {PROVIDER_MODELS[state.settings.selectedProvider].models.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>

        {/* Project Scope Selector (FR-7.2) */}
        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2">
          <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Knowledge Scope (FR-7.2)
          </label>
          <select
            value={scopeProjectId || 'all'}
            onChange={(e) =>
              setScopeProjectId(e.target.value === 'all' ? null : e.target.value)
            }
            className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
          >
            <option value="all">🌐 {t.agent.scopeAll}</option>
            {allowedProjects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.icon} {p.name}
              </option>
            ))}
          </select>

          {/* Excluded Projects Privacy Indicator (FR-1.6) */}
          {excludedProjects.length > 0 && (
            <div className="flex items-start gap-2 p-2 rounded-lg bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-800/60 text-[11px] text-amber-800 dark:text-amber-300">
              <Lock className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>
                <strong>Privacy Lock Active:</strong>{' '}
                {excludedProjects.map((p) => p.name).join(', ')} is marked{' '}
                <em>Exclude from AI Agent</em> and is strictly blocked from indexing & prompts.
              </span>
            </div>
          )}
        </div>

        {/* Quick Prompt Starters */}
        <div className="space-y-1.5">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Try One-Click Actions
          </span>
          {[
            'סכם לי את הפגישה האחרונה ומה הוחלט בה',
            'Create task: Review Firestore Spark quota metrics tomorrow at 10:00 high priority',
            'Propose an edit to the Architecture Overview page adding a Pre-Launch Checklist',
            'Create a new page summarizing our Android Widget & Windows Tray architecture',
            'Delete the old draft task (test non-deletion guardrail FR-7.10)',
          ].map((sample, i) => (
            <button
              key={i}
              onClick={() => handleSend(sample)}
              dir={detectTextDirection(sample)}
              className="w-full text-left px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800/70 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 border border-slate-200/80 dark:border-slate-700/80 text-slate-700 dark:text-slate-200 transition"
            >
              ✨ {sample}
            </button>
          ))}
        </div>

        {/* Conversations List */}
        <div className="flex-1 space-y-1.5 pt-2 border-t border-slate-100 dark:border-slate-800">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Conversations
            </span>
            {activeConversation && (
              <button
                onClick={() => clearConversationMessages(activeConversation.id)}
                className="text-[11px] text-slate-400 hover:text-slate-600 inline-flex items-center gap-1"
              >
                <RotateCcw className="w-3 h-3" /> Reset
              </button>
            )}
          </div>
          {state.conversations.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelectedConvId(c.id)}
              className={`w-full text-left px-3 py-2 rounded-xl text-xs font-medium truncate transition ${
                activeConversation?.id === c.id
                  ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800'
                  : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400'
              }`}
            >
              💬 {c.title}
            </button>
          ))}
        </div>
      </div>

      {/* Right Column: Chat Stream, Citations, Diff Review Cards & Input */}
      <div className="lg:col-span-8 flex flex-col bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-2xs">
        {/* Safety Guardrail Header */}
        <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="text-slate-600 dark:text-slate-300 font-medium">
            🛡️ {t.agent.safetyNotice}
          </span>
          <span className="font-mono text-[11px] text-indigo-600 dark:text-indigo-400">
            Model: {state.settings.selectedModelId}
          </span>
        </div>

        {/* Messages Scroll Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {activeConversation?.messages.map((msg) => {
            const isUser = msg.role === 'user';
            const dir = detectTextDirection(msg.content);
            const proposals = (msg.editProposalIds || [])
              .map((id) => state.editProposals.find((p) => p.id === id))
              .filter(Boolean);

            return (
              <div
                key={msg.id}
                className={`flex items-start gap-3 ${isUser ? 'flex-row-reverse' : ''}`}
              >
                <div
                  className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                    isUser
                      ? 'bg-indigo-600 text-white'
                      : 'bg-violet-100 dark:bg-violet-950 text-violet-700 dark:text-violet-300'
                  }`}
                >
                  {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                </div>

                <div className="max-w-2xl space-y-3 flex-1">
                  <div
                    dir={dir}
                    className={`p-4 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                      isUser
                        ? 'bg-indigo-600 text-white rounded-tr-xs'
                        : 'bg-slate-50 dark:bg-slate-800/80 text-slate-800 dark:text-slate-100 border border-slate-200/80 dark:border-slate-700/80 rounded-tl-xs'
                    }`}
                  >
                    {msg.content}
                  </div>

                  {/* Created Items Badges (FR-7.4, FR-7.5, FR-7.6) */}
                  {msg.createdItems && msg.createdItems.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {msg.createdItems.map((ci) => (
                        <button
                          key={ci.id}
                          onClick={() => navigateToItem(ci.type, ci.id, ci.projectId)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 transition"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>
                            Created {ci.type}: {ci.title}
                          </span>
                          <ExternalLink className="w-3 h-3" />
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Inline Side-by-Side Diff Proposals (FR-7.9) */}
                  {proposals.map(
                    (prop) =>
                      prop && <DiffReviewCard key={prop.id} proposal={prop} />
                  )}

                  {/* Non-Deletion Guardrail Card (FR-7.10: Agent can NEVER delete items itself) */}
                  {msg.deletionSuggestion && (
                    <div className="p-4 rounded-2xl border-2 border-amber-300 dark:border-amber-700 bg-amber-50/70 dark:bg-amber-950/30 space-y-2">
                      <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300 font-bold text-xs uppercase tracking-wider">
                        <ShieldAlert className="w-4 h-4" />
                        Non-Deletion Guardrail (FR-7.10) — Manual User Action Required
                      </div>
                      <p className="text-xs text-slate-700 dark:text-slate-300">
                        The AI Agent is strictly prohibited from deleting any item. It identified{' '}
                        <strong>"{msg.deletionSuggestion.itemTitle}"</strong> (
                        {msg.deletionSuggestion.itemType}) for removal. If you wish to move it to Trash, click below:
                      </p>
                      <button
                        onClick={() => {
                          const s = msg.deletionSuggestion!;
                          if (s.itemType === 'task') deleteTaskToTrash(s.itemId);
                          if (s.itemType === 'page') deletePageToTrash(s.itemId);
                          if (s.itemType === 'file') deleteFileToTrash(s.itemId);
                          if (s.itemType === 'meeting') deleteMeetingToTrash(s.itemId);
                          if (s.itemType === 'canvas') deleteCanvasToTrash(s.itemId);
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-600 text-white text-xs font-semibold hover:bg-rose-700"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Confirm: Move "{msg.deletionSuggestion.itemTitle}" to Trash
                      </button>
                    </div>
                  )}

                  {/* Grounded Source Citations (FR-7.3) */}
                  {msg.citations && msg.citations.length > 0 && (
                    <div className="pt-1">
                      <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                        📚 {t.agent.sourcesUsed}:
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {msg.citations.map((cit) => (
                          <button
                            key={cit.id}
                            onClick={() =>
                              navigateToItem(cit.itemType, cit.itemId, cit.projectId)
                            }
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-indigo-400 transition"
                          >
                            <span className="uppercase text-[9px] font-bold px-1 py-0.2 rounded bg-indigo-50 dark:bg-indigo-950 text-indigo-600">
                              {cit.itemType}
                            </span>
                            <span className="truncate max-w-[180px] font-medium">
                              {cit.title}
                            </span>
                            <ExternalLink className="w-3 h-3 text-slate-400" />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Bottom Prompt Bar with Voice-to-Text (FR-7.14) */}
        <div className="p-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900">
          <div className="flex items-end gap-2">
            {/* Voice Language Selector & Mic Button */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() =>
                  setVoiceLang((prev) => (prev === 'he-IL' ? 'en-US' : 'he-IL'))
                }
                className="px-2 py-2 rounded-xl text-[11px] font-bold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300"
                title="Switch Voice Dictation Language (Hebrew / English)"
              >
                {voiceLang === 'he-IL' ? '🇮🇱 עב' : '🇺🇸 EN'}
              </button>
              <button
                type="button"
                onClick={toggleVoiceDictation}
                className={`p-2.5 rounded-xl border transition ${
                  isListeningVoice
                    ? 'bg-rose-600 text-white border-rose-600 animate-pulse'
                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100'
                }`}
                title="Voice-to-Text Input (Hebrew & English - FR-7.14)"
              >
                {isListeningVoice ? (
                  <MicOff className="w-4 h-4" />
                ) : (
                  <Mic className="w-4 h-4" />
                )}
              </button>
            </div>

            <textarea
              dir={detectTextDirection(promptInput)}
              value={promptInput}
              onChange={(e) => setPromptInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              rows={2}
              placeholder={t.agent.placeholder}
              className="flex-1 px-3.5 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            />

            <button
              onClick={() => handleSend()}
              disabled={isSending || !promptInput.trim()}
              className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm inline-flex items-center gap-1.5 transition disabled:opacity-40"
            >
              <Send className="w-4 h-4" />
              <span>{isSending ? '...' : 'Send'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
