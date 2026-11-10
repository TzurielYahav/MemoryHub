import React, { useState } from 'react';
import { Check, CheckCheck, X, FileEdit, Sparkles, GitCompare } from 'lucide-react';
import { AgentEditProposal } from '../types/domain';
import { useWorkspace } from '../context/WorkspaceContext';
import { detectTextDirection } from '../i18n/translations';

export const DiffReviewCard: React.FC<{ proposal: AgentEditProposal }> = ({ proposal }) => {
  const { applyEditProposalDecision, navigateToItem } = useWorkspace();
  const [selectedBlocks, setSelectedBlocks] = useState<Record<string, boolean>>(() => {
    const map: Record<string, boolean> = {};
    proposal.blockChanges.forEach((bc) => {
      map[bc.blockId] = bc.accepted ?? true;
    });
    return map;
  });

  const isPending = proposal.status === 'pending';

  const toggleBlock = (blockId: string) => {
    if (!isPending) return;
    setSelectedBlocks((prev) => ({ ...prev, [blockId]: !prev[blockId] }));
  };

  const handleAcceptSelected = () => {
    const ids = Object.entries(selectedBlocks)
      .filter(([, checked]) => checked)
      .map(([id]) => id);
    applyEditProposalDecision(proposal.id, 'accept_selected', ids);
  };

  return (
    <div className="rounded-xl border border-indigo-200 dark:border-indigo-900/60 bg-indigo-50/40 dark:bg-indigo-950/20 p-4 shadow-sm my-3">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-indigo-200/70 dark:border-indigo-800/50">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-indigo-600 text-white">
            <GitCompare className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider px-2 py-0.5 rounded bg-indigo-100 dark:bg-indigo-900/70 text-indigo-700 dark:text-indigo-300">
                {proposal.origin === 'routine' ? 'Routine Diff Proposal' : 'Agent Diff Review (FR-7.9)'}
              </span>
              <button
                onClick={() => navigateToItem(proposal.targetType, proposal.targetId, proposal.projectId)}
                className="text-sm font-semibold text-indigo-700 dark:text-indigo-300 hover:underline flex items-center gap-1"
              >
                <FileEdit className="w-3.5 h-3.5" />
                {proposal.targetTitle}
              </button>
            </div>
            <p
              dir={detectTextDirection(proposal.summaryOfChanges)}
              className="text-xs text-notion-muted dark:text-notion-darkMuted mt-0.5"
            >
              {proposal.summaryOfChanges}
            </p>
          </div>
        </div>

        <div>
          {proposal.status === 'accepted_all' && (
            <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300">
              <CheckCheck className="w-3.5 h-3.5" /> Accepted All (Saved to Version History)
            </span>
          )}
          {proposal.status === 'accepted_partial' && (
            <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300">
              <Check className="w-3.5 h-3.5" /> Accepted Selected Blocks
            </span>
          )}
          {proposal.status === 'rejected' && (
            <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300">
              <X className="w-3.5 h-3.5" /> Rejected (No changes applied)
            </span>
          )}
        </div>
      </div>

      {/* Side-by-Side Before & After Comparison */}
      <div className="mt-3 space-y-2.5">
        {proposal.blockChanges.map((change) => {
          const checked = !!selectedBlocks[change.blockId];
          const textDir = detectTextDirection(change.afterText || change.beforeText);
          return (
            <div
              key={change.blockId}
              className="rounded-lg border border-notion-border dark:border-notion-darkBorder bg-white dark:bg-notion-darkCard p-3"
            >
              <div className="flex items-center justify-between mb-2">
                <label className="flex items-center gap-2 text-xs font-medium cursor-pointer select-none">
                  <input
                    type="checkbox"
                    disabled={!isPending}
                    checked={checked}
                    onChange={() => toggleBlock(change.blockId)}
                    className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span
                    className={
                      change.changeType === 'added'
                        ? 'text-emerald-600 dark:text-emerald-400 font-semibold'
                        : 'text-amber-600 dark:text-amber-400 font-semibold'
                    }
                  >
                    {change.changeType === 'added' ? '+ New Block Addition' : '~ Modified Block'}
                  </span>
                </label>
                <span className="text-[11px] font-mono text-notion-muted dark:text-notion-darkMuted">
                  Block ID: {change.blockId}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {/* BEFORE */}
                <div className="rounded-md bg-rose-50/70 dark:bg-rose-950/30 border border-rose-200/70 dark:border-rose-900/50 p-2.5">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-rose-700 dark:text-rose-300 mb-1">
                    Before (Current)
                  </div>
                  <div
                    dir={textDir}
                    className="text-xs text-rose-900 dark:text-rose-200 whitespace-pre-wrap leading-relaxed"
                  >
                    {change.beforeText ? (
                      <span className="bg-rose-200/60 dark:bg-rose-900/60 px-1 rounded line-through">
                        {change.beforeText}
                      </span>
                    ) : (
                      <span className="italic text-notion-muted">(New block — did not exist before)</span>
                    )}
                  </div>
                </div>

                {/* AFTER */}
                <div className="rounded-md bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/70 dark:border-emerald-900/50 p-2.5">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300 mb-1">
                    After (Proposed by Agent)
                  </div>
                  <div
                    dir={textDir}
                    className="text-xs text-emerald-950 dark:text-emerald-100 whitespace-pre-wrap leading-relaxed"
                  >
                    <span className="bg-emerald-200/60 dark:bg-emerald-900/60 px-1 rounded font-medium">
                      {change.afterText}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Action Buttons: Accept All, Accept Part (Selected), Reject */}
      {isPending && (
        <div className="mt-3 pt-3 border-t border-indigo-200/60 dark:border-indigo-800/50 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs text-notion-muted dark:text-notion-darkMuted">
            <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
            <span>Previous state is automatically backed up to Version History upon acceptance.</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => applyEditProposalDecision(proposal.id, 'accept_all')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              Accept All
            </button>
            <button
              onClick={handleAcceptSelected}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm transition"
            >
              <Check className="w-3.5 h-3.5" />
              Accept Selected ({Object.values(selectedBlocks).filter(Boolean).length})
            </button>
            <button
              onClick={() => applyEditProposalDecision(proposal.id, 'reject')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white dark:bg-notion-darkCard hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800 transition"
            >
              <X className="w-3.5 h-3.5" />
              Reject
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
