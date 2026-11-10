import React, { useState, useRef, useMemo } from 'react';
import {
  Upload,
  FileText,
  Image as ImageIcon,
  CheckCircle2,
  ScanText,
  Trash2,
  FolderInput,
  Eye,
  Sparkles,
  RefreshCw,
  ExternalLink,
  HardDrive,
} from 'lucide-react';
import { WorkspaceFile } from '../types/domain';
import { useWorkspace } from '../context/WorkspaceContext';
import { detectTextDirection, useTranslations } from '../i18n/translations';

interface FilesAndOcrViewProps {
  projectId: string;
  folderId: string | null;
  fileId?: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export const FilesAndOcrView: React.FC<FilesAndOcrViewProps> = ({
  projectId,
  folderId,
  fileId,
}) => {
  const {
    state,
    selectedFileId,
    setSelectedFileId,
    setActiveProjectFile,
    uploadWorkspaceFile,
    deleteFileToTrash,
    moveItemToLocation,
    syncDriveFiles,
  } = useWorkspace();
  const t = useTranslations(state.settings.language);

  const [isUploading, setIsUploading] = useState(false);
  const [movingFile, setMovingFile] = useState<WorkspaceFile | null>(null);
  const [isSyncingDrive, setIsSyncingDrive] = useState(false);
  const [driveSyncBanner, setDriveSyncBanner] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const effectiveFileId = fileId ?? selectedFileId;

  const projectFiles = useMemo(
    () =>
      state.files.filter(
        (f) =>
          !f.isDeleted &&
          f.projectId === projectId &&
          (effectiveFileId ? true : folderId === null || f.folderId === folderId)
      ),
    [state.files, projectId, folderId, effectiveFileId]
  );

  const activeFile = useMemo(
    () => projectFiles.find((f) => f.id === effectiveFileId) || projectFiles[0],
    [projectFiles, effectiveFileId]
  );

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setIsUploading(true);
    for (let i = 0; i < files.length; i++) {
      const created = await uploadWorkspaceFile(files[i], projectId, folderId);
      setSelectedFileId(created.id);
      setActiveProjectFile({ type: 'file', id: created.id });
    }
    setIsUploading(false);
    e.target.value = '';
  };

  const isImage = activeFile?.mimeType.startsWith('image/');

  return (
    <div className="space-y-4">
      <input
        ref={fileInputRef}
        type="file"
        multiple
        onChange={handleFileChange}
        className="hidden"
      />

      {activeFile ? (
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-5 shadow-2xs">
          {/* File Header Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
            <div className="flex items-start gap-3 min-w-0">
              <div className="p-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 shrink-0">
                {isImage ? (
                  <ImageIcon className="w-5 h-5" />
                ) : (
                  <FileText className="w-5 h-5" />
                )}
              </div>
              <div className="min-w-0">
                <h4
                  dir={detectTextDirection(activeFile.name)}
                  className="font-bold text-base text-slate-900 dark:text-white truncate"
                >
                  {activeFile.name}
                </h4>
                <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-slate-500">
                  <span>{activeFile.mimeType}</span>
                  <span>•</span>
                  <span>{formatBytes(activeFile.sizeBytes)}</span>
                  <span>•</span>
                  <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {activeFile.driveSyncStatus === 'synced'
                      ? `Drive (${state.settings.googleAccount.driveFolderName}) + Offline Cached`
                      : 'Offline Local Cache'}
                  </span>
                  {activeFile.ocrStatus === 'completed' && (
                    <span className="px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 text-[11px] font-semibold">
                      OCR Indexed
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {activeFile.driveWebViewLink && (
                <a
                  href={activeFile.driveWebViewLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 transition"
                >
                  <ExternalLink className="w-3.5 h-3.5" /> Open in Google Drive
                </a>
              )}

              <button
                disabled={isSyncingDrive || !state.settings.googleAccount.connected}
                onClick={async () => {
                  setIsSyncingDrive(true);
                  setDriveSyncBanner(null);
                  const res = await syncDriveFiles();
                  setIsSyncingDrive(false);
                  setDriveSyncBanner(`Synced with Google Drive: ${res.uploaded} uploaded, ${res.downloaded} downloaded.`);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition disabled:opacity-50"
                title="Sync files with Google Drive (/MemoryHub) across devices"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncingDrive ? 'animate-spin' : ''}`} />
                Sync Drive
              </button>

              {activeFile.dataUrl && (
                <a
                  href={activeFile.dataUrl}
                  download={activeFile.name}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition"
                >
                  <Eye className="w-3.5 h-3.5" /> Download / Open Copy
                </a>
              )}

              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 text-xs font-semibold transition disabled:opacity-50"
              >
                <Upload className="w-3.5 h-3.5" />
                {isUploading ? 'Extracting OCR...' : 'Upload Another File'}
              </button>

              <button
                onClick={() => setMovingFile(activeFile)}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                title={t.project.moveItem}
              >
                <FolderInput className="w-4 h-4" />
              </button>

              <button
                onClick={() => deleteFileToTrash(activeFile.id)}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-400 hover:text-rose-600"
                title="Move to Trash"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          {driveSyncBanner && (
            <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-xs flex items-center justify-between">
              <span>{driveSyncBanner}</span>
              <button onClick={() => setDriveSyncBanner(null)} className="text-slate-400 hover:text-slate-600">×</button>
            </div>
          )}

          {/* Image Preview if applicable */}
          {isImage && activeFile.dataUrl && (
            <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 p-3 flex justify-center">
              <img
                src={activeFile.dataUrl}
                alt={activeFile.name}
                className="max-h-96 object-contain rounded-lg"
              />
            </div>
          )}

          {/* Extracted PDF / OCR Text Box */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                <ScanText className="w-4 h-4" />
                Extracted PDF & Hebrew/English OCR Text (Searchable & AI-Indexed)
              </span>
              <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                <Sparkles className="w-3 h-3" /> Available to AI Agent RAG
              </span>
            </div>

            <div
              dir={detectTextDirection(activeFile.extractedText)}
              className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs text-slate-800 dark:text-slate-200 font-mono whitespace-pre-wrap leading-relaxed max-h-[420px] overflow-y-auto"
            >
              {activeFile.extractedText || 'No text extracted.'}
            </div>
          </div>
        </div>
      ) : (
        <div className="p-12 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center space-y-3">
          <p className="text-slate-500 text-sm">
            No file selected or uploaded in this folder yet.
          </p>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-xs transition disabled:opacity-50"
          >
            <Upload className="w-3.5 h-3.5" />
            {isUploading ? 'Extracting Text & OCR...' : 'Upload PDF / Image / Doc'}
          </button>
        </div>
      )}

      {/* Move File Modal (FR-1.4) */}
      {movingFile && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-5 border border-slate-200 dark:border-slate-800 shadow-xl">
            <h3 className="font-semibold text-base mb-3">
              Move "{movingFile.name}" to Project / Folder
            </h3>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {state.projects
                .filter((p) => !p.isDeleted)
                .map((proj) => (
                  <div key={proj.id} className="space-y-1">
                    <button
                      onClick={() => {
                        moveItemToLocation('file', movingFile.id, proj.id, null);
                        setMovingFile(null);
                      }}
                      className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-sm font-medium"
                    >
                      {proj.icon} {proj.name} (Root)
                    </button>
                    {state.subfolders
                      .filter((sf) => !sf.isDeleted && sf.projectId === proj.id)
                      .map((sf) => (
                        <button
                          key={sf.id}
                          onClick={() => {
                            moveItemToLocation('file', movingFile.id, proj.id, sf.id);
                            setMovingFile(null);
                          }}
                          className="w-full text-left pl-7 pr-3 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-xs text-slate-600 dark:text-slate-400"
                        >
                          ↳ {sf.icon} {sf.name}
                        </button>
                      ))}
                  </div>
                ))}
            </div>
            <div className="mt-4 flex justify-end">
              <button
                onClick={() => setMovingFile(null)}
                className="px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
