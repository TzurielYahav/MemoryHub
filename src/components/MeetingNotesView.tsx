import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Mic,
  MonitorSpeaker,
  Square,
  Sparkles,
  UserCheck,
  Check,
  X,
  Edit3,
  Trash2,
  Volume2,
  VolumeX,
  WifiOff,
  FileText,
  CheckCircle2,
  Play,
  Pause,
  KeyRound,
  ExternalLink,
  Activity,
  RotateCcw,
  Languages,
} from 'lucide-react';
import { MeetingNote, TranscriptSegment } from '../types/domain';
import { useWorkspace } from '../context/WorkspaceContext';
import { detectTextDirection, useTranslations } from '../i18n/translations';
import {
  detectSegmentLanguage,
  normalizeMixedHebrewEnglishText,
  transcribeBilingualAudioChunk,
  transcribeAndSummarizeMeetingAudio,
} from '../services/mediaAiService';

interface MeetingNotesViewProps {
  projectId: string;
  folderId: string | null;
  meetingId?: string;
  isNewRecordingMode?: boolean;
}

function formatDuration(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const totalSec = Math.floor(sec);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function getLanguageBadgeInfo(lang: 'he' | 'en' | 'mixed') {
  if (lang === 'mixed') {
    return {
      label: 'עברית + EN',
      className:
        'bg-violet-100 text-violet-800 dark:bg-violet-950/70 dark:text-violet-300 border-violet-200 dark:border-violet-800',
    };
  }
  if (lang === 'he') {
    return {
      label: 'עברית',
      className:
        'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/70 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800',
    };
  }
  return {
    label: 'English',
    className:
      'bg-sky-100 text-sky-800 dark:bg-sky-950/70 dark:text-sky-300 border-sky-200 dark:border-sky-800',
  };
}

/**
 * Custom Audio Player that solves the Chromium MediaRecorder WebM `duration === Infinity` bug
 * where native `<audio controls>` jumps straight to the end until playback finishes.
 * Pre-decodes the exact finite duration via Web Audio API and supports instant seeking,
 * accurate progress bar from 0% to 100%, and playback speed control.
 */
const MeetingAudioPlayer: React.FC<{
  audioDataUrl: string;
  fallbackDurationSec: number;
}> = ({ audioDataUrl, fallbackDurationSec }) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const isFixingInfinityRef = useRef(false);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [resolvedDuration, setResolvedDuration] = useState<number>(
    Math.max(1, fallbackDurationSec || 1)
  );
  const [playbackRate, setPlaybackRate] = useState<number>(1);
  const [isMuted, setIsMuted] = useState(false);

  // Pre-decode exact finite duration from the audio Data URL using AudioContext
  useEffect(() => {
    setIsPlaying(false);
    setCurrentTime(0);
    setResolvedDuration(Math.max(1, fallbackDurationSec || 1));

    let cancelled = false;
    const decodeExactDuration = async () => {
      try {
        const res = await fetch(audioDataUrl);
        const arrayBuf = await res.arrayBuffer();
        const AudioCtx =
          window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!AudioCtx) return;
        const ctx = new AudioCtx();
        const decoded = await ctx.decodeAudioData(arrayBuf.slice(0));
        if (!cancelled && Number.isFinite(decoded.duration) && decoded.duration > 0) {
          setResolvedDuration(decoded.duration);
        }
        await ctx.close();
      } catch {
        // Fallback to fallbackDurationSec or metadata duration
      }
    };

    decodeExactDuration();
    return () => {
      cancelled = true;
    };
  }, [audioDataUrl, fallbackDurationSec]);

  const handleLoadedMetadata = () => {
    const el = audioRef.current;
    if (!el) return;
    if (Number.isFinite(el.duration) && el.duration > 0) {
      setResolvedDuration(el.duration);
    } else {
      // Chromium WebM streaming blob duration workaround: seek to end once so browser calculates finite duration
      isFixingInfinityRef.current = true;
      el.currentTime = 1e101;
    }
  };

  const handleDurationChange = () => {
    const el = audioRef.current;
    if (!el) return;
    if (Number.isFinite(el.duration) && el.duration > 0) {
      setResolvedDuration(el.duration);
    }
  };

  const handleTimeUpdate = () => {
    const el = audioRef.current;
    if (!el) return;
    if (isFixingInfinityRef.current) {
      isFixingInfinityRef.current = false;
      el.currentTime = 0;
      if (Number.isFinite(el.duration) && el.duration > 0) {
        setResolvedDuration(el.duration);
      }
      setCurrentTime(0);
      return;
    }
    setCurrentTime(el.currentTime);
    if (Number.isFinite(el.duration) && el.duration > 0 && el.duration > resolvedDuration) {
      setResolvedDuration(el.duration);
    }
  };

  const togglePlay = async () => {
    const el = audioRef.current;
    if (!el) return;
    if (isPlaying) {
      el.pause();
      setIsPlaying(false);
    } else {
      if (el.currentTime >= resolvedDuration - 0.15) {
        el.currentTime = 0;
        setCurrentTime(0);
      }
      try {
        await el.play();
        setIsPlaying(true);
      } catch {
        setIsPlaying(false);
      }
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nextTime = Number(e.target.value);
    setCurrentTime(nextTime);
    if (audioRef.current && !isFixingInfinityRef.current) {
      audioRef.current.currentTime = nextTime;
    }
  };

  const cyclePlaybackRate = () => {
    const rates = [1, 1.25, 1.5, 2];
    const nextRate = rates[(rates.indexOf(playbackRate) + 1) % rates.length];
    setPlaybackRate(nextRate);
    if (audioRef.current) {
      audioRef.current.playbackRate = nextRate;
    }
  };

  const toggleMute = () => {
    const next = !isMuted;
    setIsMuted(next);
    if (audioRef.current) {
      audioRef.current.muted = next;
    }
  };

  const safeDuration = Math.max(0.1, resolvedDuration);
  const progressPct = Math.min(100, Math.max(0, (currentTime / safeDuration) * 100));

  return (
    <div className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700">
      <audio
        ref={audioRef}
        src={audioDataUrl}
        preload="metadata"
        onLoadedMetadata={handleLoadedMetadata}
        onDurationChange={handleDurationChange}
        onTimeUpdate={handleTimeUpdate}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => {
          setIsPlaying(false);
          setCurrentTime(resolvedDuration);
        }}
        className="hidden"
      />

      {/* Play / Pause Button */}
      <button
        type="button"
        onClick={togglePlay}
        className="w-8 h-8 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white flex items-center justify-center shrink-0 shadow-2xs transition"
        title={isPlaying ? 'Pause' : 'Play recording'}
      >
        {isPlaying ? (
          <Pause className="w-4 h-4 fill-current" />
        ) : (
          <Play className="w-4 h-4 fill-current ms-0.5" />
        )}
      </button>

      {/* Restart Button */}
      <button
        type="button"
        onClick={() => {
          if (audioRef.current) {
            audioRef.current.currentTime = 0;
            setCurrentTime(0);
          }
        }}
        className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-700 shrink-0 transition"
        title="Restart from 00:00"
      >
        <RotateCcw className="w-3.5 h-3.5" />
      </button>

      {/* Time Display */}
      <div className="text-xs font-mono text-slate-600 dark:text-slate-300 shrink-0 min-w-[82px]">
        <span className="font-semibold text-slate-900 dark:text-white">
          {formatDuration(currentTime)}
        </span>{' '}
        / {formatDuration(resolvedDuration)}
      </div>

      {/* Accurate Progress Scrubber Bar */}
      <div className="relative flex-1 flex items-center h-6">
        <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden pointer-events-none">
          <div
            className="h-full bg-indigo-600 dark:bg-indigo-500 rounded-full transition-[width] duration-75"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <input
          type="range"
          min={0}
          max={safeDuration}
          step={0.05}
          value={Math.min(currentTime, safeDuration)}
          onChange={handleSeek}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          title="Drag to seek through recording"
        />
      </div>

      {/* Playback Speed Button */}
      <button
        type="button"
        onClick={cyclePlaybackRate}
        className="px-2 py-1 rounded-lg text-[11px] font-mono font-bold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 shrink-0"
        title="Change Playback Speed"
      >
        {playbackRate}x
      </button>

      {/* Mute / Unmute Button */}
      <button
        type="button"
        onClick={toggleMute}
        className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-700 shrink-0"
        title={isMuted ? 'Unmute' : 'Mute'}
      >
        {isMuted ? (
          <VolumeX className="w-4 h-4 text-rose-500" />
        ) : (
          <Volume2 className="w-4 h-4 text-indigo-600" />
        )}
      </button>
    </div>
  );
};

export const MeetingNotesView: React.FC<MeetingNotesViewProps> = ({
  projectId,
  folderId,
  meetingId,
  isNewRecordingMode = false,
}) => {
  const {
    state,
    selectedMeetingId,
    setSelectedMeetingId,
    setActiveProjectFile,
    createMeetingNote,
    updateMeetingNote,
    renameMeetingSpeaker,
    deleteMeetingOriginalAudio,
    handleMeetingTaskSuggestion,
    deleteMeetingToTrash,
    updateSettings,
  } = useWorkspace();
  const t = useTranslations(state.settings.language);

  const projectMeetings = useMemo(
    () => state.meetings.filter((m) => !m.isDeleted && m.projectId === projectId),
    [state.meetings, projectId]
  );

  const [showRecorderPanel, setShowRecorderPanel] = useState(isNewRecordingMode);
  const [showApiKeyHelper, setShowApiKeyHelper] = useState(false);

  // Requirement 1: When creating a new meeting (isNewRecordingMode or showRecorderPanel),
  // NEVER fall back to or display the previous meeting — open a totally new empty meeting view.
  const isCreatingNewMeeting = isNewRecordingMode || showRecorderPanel;
  const targetMeetingId = isCreatingNewMeeting ? null : meetingId || selectedMeetingId;

  const activeMeeting: MeetingNote | undefined = useMemo(() => {
    if (isCreatingNewMeeting) return undefined;
    if (targetMeetingId) {
      return projectMeetings.find((m) => m.id === targetMeetingId) || projectMeetings[0];
    }
    return projectMeetings[0];
  }, [projectMeetings, targetMeetingId, isCreatingNewMeeting]);

  // Live Recording State
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isReTranscribing, setIsReTranscribing] = useState(false);
  const [isProcessingLiveChunk, setIsProcessingLiveChunk] = useState(false);
  const [captureMode, setCaptureMode] = useState<'mic_only' | 'mic_and_system_audio'>(
    'mic_and_system_audio'
  );
  const [recordingTitle, setRecordingTitle] = useState('');
  const [liveUserNotes, setLiveUserNotes] = useState('');
  const [elapsedSec, setElapsedSec] = useState(0);

  // Requirement 2: Bilingual Hebrew + English + Intra-Sentence Code-Switching Live Transcription
  const [soundBars, setSoundBars] = useState<number[]>(() => Array(28).fill(6));
  const [peakVolumePct, setPeakVolumePct] = useState(0);
  const [liveTranscriptSegments, setLiveTranscriptSegments] = useState<TranscriptSegment[]>([]);
  const [interimSpeechText, setInterimSpeechText] = useState('');
  const [activeLiveSpeaker, setActiveLiveSpeaker] = useState<'speaker_1' | 'speaker_2'>('speaker_1');
  const [activeRecognitionLocale, setActiveRecognitionLocale] = useState<'he-IL' | 'en-US'>(
    state.settings.language === 'he' ? 'he-IL' : 'en-US'
  );

  // Reset form to a completely clean empty meeting whenever entering New Recording mode
  useEffect(() => {
    setShowRecorderPanel(isNewRecordingMode);
    if (isNewRecordingMode && !isRecording) {
      setRecordingTitle('');
      setLiveUserNotes('');
      setLiveTranscriptSegments([]);
      setInterimSpeechText('');
      setElapsedSec(0);
    }
  }, [isNewRecordingMode]);

  const openFreshEmptyMeeting = () => {
    setRecordingTitle('');
    setLiveUserNotes('');
    setLiveTranscriptSegments([]);
    setInterimSpeechText('');
    setElapsedSec(0);
    setSelectedMeetingId(null);
    setShowRecorderPanel(true);
    setActiveProjectFile({
      type: 'new-meeting',
      id: `new-${Date.now()}`,
      folderId,
    });
  };

  const handleRetryTranscription = async () => {
    if (!activeMeeting || !activeMeeting.audioDataUrl || isReTranscribing) return;
    setIsReTranscribing(true);
    try {
      const result = await transcribeAndSummarizeMeetingAudio(
        activeMeeting.audioDataUrl,
        activeMeeting.audioMimeType || 'audio/webm',
        activeMeeting.userLiveNotes || '',
        activeMeeting.title,
        state.settings
      );
      updateMeetingNote(activeMeeting.id, {
        speakerLabels: result.speakerLabels,
        segments: result.segments,
        summary: result.summary,
        keyPoints: result.keyPoints,
        decisions: result.decisions,
        taskSuggestions: result.taskSuggestions,
        transcriptionStatus: 'completed',
      });
    } catch (err) {
      console.error('Retry transcription failed:', err);
    } finally {
      setIsReTranscribing(false);
    }
  };

  const [editingSpeakerId, setEditingSpeakerId] = useState<string | null>(null);
  const [speakerNameInput, setSpeakerNameInput] = useState('');
  const [editingSuggestionId, setEditingSuggestionId] = useState<string | null>(null);
  const [suggestionTitleInput, setSuggestionTitleInput] = useState('');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const recordingStartMsRef = useRef<number>(0);
  const streamsToCleanupRef = useRef<MediaStream[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const speechRecRef = useRef<any>(null);
  const isRecordingRef = useRef(false);
  const activeSpeakerRef = useRef<'speaker_1' | 'speaker_2'>('speaker_1');
  const segmentStartSecRef = useRef<number>(0);

  // Non-overlapping standalone audio chunk recorder for live Gemini bilingual + code-switching ASR
  const chunkRecorderRef = useRef<MediaRecorder | null>(null);
  const chunkStartSecRef = useRef<number>(0);
  const chunkMaxPeakRef = useRef<number>(0);
  const liveChunkTimerRef = useRef<number | null>(null);
  const finalStreamRef = useRef<MediaStream | null>(null);
  const liveSegmentsRef = useRef<TranscriptSegment[]>([]);
  const recordingTitleRef = useRef<string>('');
  const liveUserNotesRef = useRef<string>('');
  const settingsRef = useRef(state.settings);

  useEffect(() => {
    settingsRef.current = state.settings;
  }, [state.settings]);

  useEffect(() => {
    liveSegmentsRef.current = liveTranscriptSegments;
  }, [liveTranscriptSegments]);

  useEffect(() => {
    recordingTitleRef.current = recordingTitle;
  }, [recordingTitle]);

  useEffect(() => {
    liveUserNotesRef.current = liveUserNotes;
  }, [liveUserNotes]);

  useEffect(() => {
    activeSpeakerRef.current = activeLiveSpeaker;
  }, [activeLiveSpeaker]);

  /**
   * Starts a fresh standalone 7-second MediaRecorder on `finalStream` so every chunk has
   * its own valid WebM container header and is sent to Gemini's native acoustic audio model
   * with sliding context (previous sentences + meeting title + notes).
   * Never locks into a single language—distinguishes Hebrew sentences, English sentences,
   * and English words embedded inside Hebrew sentences.
   */
  const startNextStandaloneAudioChunk = () => {
    const stream = finalStreamRef.current;
    const geminiKey = settingsRef.current.apiKeys.gemini?.trim();
    if (!isRecordingRef.current || !stream || !geminiKey || !navigator.onLine) return;

    try {
      const localBlobs: Blob[] = [];
      const chunkStartSec = Math.max(
        0,
        Math.round((Date.now() - recordingStartMsRef.current) / 1000)
      );
      chunkStartSecRef.current = chunkStartSec;
      chunkMaxPeakRef.current = 0;

      const chunkRec = new MediaRecorder(stream);
      chunkRecorderRef.current = chunkRec;

      chunkRec.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) {
          localBlobs.push(ev.data);
        }
      };

      chunkRec.onstop = async () => {
        const peakDuringChunk = chunkMaxPeakRef.current;
        const chunkEndSec = Math.max(
          chunkStartSec + 1,
          Math.round((Date.now() - recordingStartMsRef.current) / 1000)
        );

        // Start the next non-overlapping 7s chunk immediately if still recording
        if (isRecordingRef.current) {
          startNextStandaloneAudioChunk();
        }

        // Skip silent windows so zero tokens are spent on silence
        if (peakDuringChunk < 9 || localBlobs.length === 0) return;

        const chunkBlob = new Blob(localBlobs, {
          type: chunkRec.mimeType || 'audio/webm',
        });
        if (chunkBlob.size < 400) return;

        const dataUrl = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(String(reader.result || ''));
          reader.readAsDataURL(chunkBlob);
        });
        const base64Audio = dataUrl.includes(',') ? dataUrl.split(',')[1] : '';
        if (!base64Audio) return;

        const prevTail = liveSegmentsRef.current
          .slice(-3)
          .map((s) => s.text)
          .join(' | ');

        setIsProcessingLiveChunk(true);
        try {
          const bilingualSegments = await transcribeBilingualAudioChunk(
            base64Audio,
            chunkBlob.type || 'audio/webm',
            chunkStartSec,
            chunkEndSec,
            activeSpeakerRef.current,
            settingsRef.current,
            {
              meetingTitle: recordingTitleRef.current,
              userLiveNotes: liveUserNotesRef.current,
              previousTranscriptTail: prevTail,
            }
          );
          if (bilingualSegments.length > 0) {
            setLiveTranscriptSegments((prev) =>
              [...prev, ...bilingualSegments].sort(
                (a, b) => a.startTimeSec - b.startTimeSec
              )
            );
          }
        } finally {
          setIsProcessingLiveChunk(false);
        }
      };

      chunkRec.start();
    } catch {
      chunkRecorderRef.current = null;
    }
  };

  const cleanupAudioAndSpeech = () => {
    isRecordingRef.current = false;
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (liveChunkTimerRef.current) {
      window.clearInterval(liveChunkTimerRef.current);
      liveChunkTimerRef.current = null;
    }
    if (animFrameRef.current) {
      window.cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (chunkRecorderRef.current && chunkRecorderRef.current.state !== 'inactive') {
      try {
        chunkRecorderRef.current.onstop = null;
        chunkRecorderRef.current.stop();
      } catch {
        // Ignore
      }
      chunkRecorderRef.current = null;
    }
    if (speechRecRef.current) {
      try {
        speechRecRef.current.onend = null;
        speechRecRef.current.stop();
      } catch {
        // Ignore stop error
      }
      speechRecRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    finalStreamRef.current = null;
    streamsToCleanupRef.current.forEach((s) => s.getTracks().forEach((tr) => tr.stop()));
    streamsToCleanupRef.current = [];
    setSoundBars(Array(28).fill(6));
    setPeakVolumePct(0);
    setInterimSpeechText('');
  };

  useEffect(() => {
    return () => {
      cleanupAudioAndSpeech();
    };
  }, []);

  /**
   * Starts instant Live Speech Recognition (`SpeechRecognition` / `webkitSpeechRecognition`)
   * with automatic Hebrew/English code-switching normalization (`normalizeMixedHebrewEnglishText`)
   * so English terms spoken inside Hebrew sentences are preserved in Latin script.
   */
  const startLiveSpeechRecognition = (locale: 'he-IL' | 'en-US') => {
    setActiveRecognitionLocale(locale);
    const SpeechRec =
      (window as unknown as { SpeechRecognition?: any; webkitSpeechRecognition?: any })
        .SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: any }).webkitSpeechRecognition;

    if (!SpeechRec) return;

    if (speechRecRef.current) {
      try {
        speechRecRef.current.onend = null;
        speechRecRef.current.stop();
      } catch {
        // Ignore
      }
    }

    try {
      const rec = new SpeechRec();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = locale;

      rec.onresult = (event: any) => {
        let interim = '';
        const nowSec = Math.max(
          0,
          Math.floor((Date.now() - recordingStartMsRef.current) / 1000)
        );

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const res = event.results[i];
          const rawTranscript = String(res[0]?.transcript || '').trim();
          if (!rawTranscript) continue;

          // Normalize mixed Hebrew + English code-switching (e.g., English terms inside Hebrew sentences)
          const normalizedTranscript = normalizeMixedHebrewEnglishText(rawTranscript);

          if (res.isFinal) {
            const startSec = segmentStartSecRef.current;
            const endSec = Math.max(startSec + 1, nowSec);
            segmentStartSecRef.current = endSec;

            const newSeg: TranscriptSegment = {
              id: `live-webspeech-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
              speakerId: activeSpeakerRef.current,
              startTimeSec: startSec,
              endTimeSec: endSec,
              text: normalizedTranscript,
              language: detectSegmentLanguage(normalizedTranscript),
            };
            setLiveTranscriptSegments((prev) => [...prev, newSeg]);
            setInterimSpeechText('');
          } else {
            interim += normalizedTranscript + ' ';
          }
        }

        if (interim.trim()) {
          setInterimSpeechText(interim.trim());
        }
      };

      rec.onerror = () => {
        // Ignore transient no-speech errors
      };

      rec.onend = () => {
        // Automatically restart continuous recognition while recording is active
        if (isRecordingRef.current) {
          try {
            rec.start();
          } catch {
            // Ignore
          }
        }
      };

      rec.start();
      speechRecRef.current = rec;
    } catch {
      // Browser SpeechRecognition unavailable
    }
  };

  const startLiveRecording = async () => {
    recordedChunksRef.current = [];
    streamsToCleanupRef.current = [];
    chunkStartSecRef.current = 0;
    chunkMaxPeakRef.current = 0;
    setLiveTranscriptSegments([]);
    setInterimSpeechText('');
    segmentStartSecRef.current = 0;
    recordingStartMsRef.current = Date.now();
    isRecordingRef.current = true;

    let finalStream: MediaStream | null = null;

    try {
      const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamsToCleanupRef.current.push(micStream);

      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const audioCtx = new AudioCtx();
      if (audioCtx.state === 'suspended') {
        await audioCtx.resume().catch(() => {});
      }
      audioCtxRef.current = audioCtx;

      const dest = audioCtx.createMediaStreamDestination();
      const micSource = audioCtx.createMediaStreamSource(micStream);
      micSource.connect(dest);

      if (captureMode === 'mic_and_system_audio' && navigator.mediaDevices.getDisplayMedia) {
        try {
          const sysStream = await navigator.mediaDevices.getDisplayMedia({
            video: true,
            audio: true,
          });
          streamsToCleanupRef.current.push(sysStream);

          if (sysStream.getAudioTracks().length > 0) {
            const sysSource = audioCtx.createMediaStreamSource(
              new MediaStream(sysStream.getAudioTracks())
            );
            sysSource.connect(dest);
          }
        } catch {
          // Fallback to microphone if user cancels screen/system audio picker
        }
      }

      finalStream = dest.stream;
      finalStreamRef.current = finalStream;

      // Connect Web Audio AnalyserNode for real-time Sound Height Bar feedback + voice activity peak tracking
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;
      analyser.smoothingTimeConstant = 0.72;
      const analyserSource = audioCtx.createMediaStreamSource(finalStream);
      analyserSource.connect(analyser);

      const freqData = new Uint8Array(analyser.frequencyBinCount);
      const updateSoundMeter = () => {
        if (!isRecordingRef.current) return;
        analyser.getByteFrequencyData(freqData);

        const barsCount = 28;
        const nextBars: number[] = [];
        let maxVal = 0;
        for (let i = 0; i < barsCount; i++) {
          const binIdx = Math.min(freqData.length - 1, Math.floor((i / barsCount) * (freqData.length * 0.85)));
          const val = freqData[binIdx] || 0;
          if (val > maxVal) maxVal = val;
          // Normalize 0..255 to 6..100% height
          nextBars.push(Math.max(6, Math.min(100, Math.round((val / 255) * 100))));
        }

        const currentPeakPct = Math.min(100, Math.round((maxVal / 255) * 100));
        if (currentPeakPct > chunkMaxPeakRef.current) {
          chunkMaxPeakRef.current = currentPeakPct;
        }
        setSoundBars(nextBars);
        setPeakVolumePct(currentPeakPct);
        animFrameRef.current = window.requestAnimationFrame(updateSoundMeter);
      };
      animFrameRef.current = window.requestAnimationFrame(updateSoundMeter);

      const recorder = new MediaRecorder(finalStream);
      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) {
          recordedChunksRef.current.push(ev.data);
        }
      };
      recorder.start(500);
      mediaRecorderRef.current = recorder;
    } catch {
      mediaRecorderRef.current = null;
    }

    // Always start real-time speech recognition so words appear on screen immediately as you talk
    startLiveSpeechRecognition(activeRecognitionLocale);

    const geminiConfigured = Boolean(settingsRef.current.apiKeys.gemini?.trim());
    if (geminiConfigured && navigator.onLine) {
      startNextStandaloneAudioChunk();
      liveChunkTimerRef.current = window.setInterval(() => {
        if (
          isRecordingRef.current &&
          chunkRecorderRef.current &&
          chunkRecorderRef.current.state === 'recording'
        ) {
          try {
            chunkRecorderRef.current.stop();
          } catch {
            // Ignore
          }
        }
      }, 7000);
    }

    setElapsedSec(0);
    setIsRecording(true);
    if (!recordingTitle.trim()) {
      setRecordingTitle(
        `פגישת עבודה / Sync Meeting (${new Date().toLocaleDateString()})`
      );
    }
    timerRef.current = window.setInterval(() => {
      setElapsedSec(
        Math.max(1, Math.round((Date.now() - recordingStartMsRef.current) / 1000))
      );
    }, 500);
  };

  const stopAndTranscribeRecording = async () => {
    setIsRecording(false);
    setIsTranscribing(true);

    try {
      const measuredDurationSec = Math.max(
        1,
        Math.round((Date.now() - recordingStartMsRef.current) / 1000) || elapsedSec
      );

      // Stop any in-flight live chunk recorder
      if (chunkRecorderRef.current && chunkRecorderRef.current.state !== 'inactive') {
        try {
          chunkRecorderRef.current.onstop = null;
          chunkRecorderRef.current.stop();
        } catch {
          // Ignore
        }
        chunkRecorderRef.current = null;
      }

      // Flush any pending interim speech text into live segments before stopping
      const finalLiveSegments = [...liveSegmentsRef.current];
      if (interimSpeechText.trim()) {
        const normalizedInterim = normalizeMixedHebrewEnglishText(interimSpeechText.trim());
        finalLiveSegments.push({
          id: `live-seg-${Date.now()}`,
          speakerId: activeLiveSpeaker,
          startTimeSec: segmentStartSecRef.current,
          endTimeSec: measuredDurationSec,
          text: normalizedInterim,
          language: detectSegmentLanguage(normalizedInterim),
        });
      }

      let audioDataUrl: string | undefined;
      let audioMimeType = 'audio/webm';
      let exactDecodedDurationSec = measuredDurationSec;

      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        await new Promise<void>((resolve) => {
          const timer = window.setTimeout(() => resolve(), 2500);
          if (!mediaRecorderRef.current) {
            window.clearTimeout(timer);
            return resolve();
          }
          mediaRecorderRef.current.onstop = () => {
            window.clearTimeout(timer);
            resolve();
          };
          try {
            mediaRecorderRef.current.stop();
          } catch {
            window.clearTimeout(timer);
            resolve();
          }
        });

        if (recordedChunksRef.current.length > 0) {
          const blob = new Blob(recordedChunksRef.current, { type: 'audio/webm' });
          audioMimeType = 'audio/webm';

          // Decode exact duration from the recorded Blob so the player knows the true duration immediately (Requirement 3)
          try {
            const arrayBuf = await blob.arrayBuffer();
            const AudioCtx =
              window.AudioContext ||
              (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
            if (AudioCtx) {
              const tempCtx = new AudioCtx();
              const audioBuffer = await tempCtx.decodeAudioData(arrayBuf.slice(0));
              if (Number.isFinite(audioBuffer.duration) && audioBuffer.duration > 0) {
                exactDecodedDurationSec = Math.max(1, Math.round(audioBuffer.duration));
              }
              await tempCtx.close();
            }
          } catch {
            // Fallback to measuredDurationSec
          }

          audioDataUrl = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(String(reader.result || ''));
            reader.onerror = () => resolve('');
            reader.readAsDataURL(blob);
          });
        }
      }

      cleanupAudioAndSpeech();

      const created = await createMeetingNote({
        projectId,
        folderId,
        title: recordingTitle.trim() || 'Recorded Meeting / סיכום פגישה',
        captureMode,
        durationSec: exactDecodedDurationSec,
        userLiveNotes: liveUserNotes,
        audioDataUrl,
        audioMimeType,
        liveSegments: finalLiveSegments.length > 0 ? finalLiveSegments : undefined,
      });

      setRecordingTitle('');
      setLiveUserNotes('');
      setLiveTranscriptSegments([]);
      setShowRecorderPanel(false);
      setSelectedMeetingId(created.id);
      setActiveProjectFile({ type: 'meeting', id: created.id });
    } catch (err) {
      console.error('Error stopping and transcribing meeting:', err);
      cleanupAudioAndSpeech();
    } finally {
      setIsTranscribing(false);
    }
  };

  const hasGeminiKey = Boolean(state.settings.apiKeys.gemini?.trim());
  const hasGroqKey = Boolean(state.settings.apiKeys.groq?.trim());
  const hasAiKey = hasGeminiKey || hasGroqKey;

  return (
    <div className="space-y-5">
      {/* Granola-Style Live Audio + Notes Recorder Panel */}
      {(showRecorderPanel || !activeMeeting) && (
        <div className="p-5 rounded-2xl border border-indigo-200 dark:border-indigo-900/60 bg-gradient-to-br from-indigo-50/70 via-white to-violet-50/50 dark:from-indigo-950/40 dark:via-slate-900 dark:to-slate-900 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
              <Sparkles className="w-3.5 h-3.5" />
              Granola-Style Live Meeting Recorder
            </span>
            <div className="flex flex-wrap items-center gap-2">
              {/* Quick API Key Setup & Status Toggle */}
              <button
                type="button"
                onClick={() => setShowApiKeyHelper((v) => !v)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border transition ${
                  hasAiKey
                    ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300'
                    : 'bg-amber-50 dark:bg-amber-950/50 border-amber-300 dark:border-amber-800 text-amber-800 dark:text-amber-300 hover:bg-amber-100'
                }`}
                title="Configure your API Keys for AI transcription & summaries"
              >
                <KeyRound className="w-3 h-3" />
                <span>
                  {hasAiKey
                    ? `✓ AI Connected (${[hasGroqKey && 'Groq', hasGeminiKey && 'Gemini'].filter(Boolean).join(' + ')})`
                    : 'Setup AI Keys (Free)'}
                </span>
              </button>

              {!navigator.onLine && (
                <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                  <WifiOff className="w-3 h-3" /> Offline Queue Ready
                </span>
              )}
              {projectMeetings.length > 0 && !isRecording && isCreatingNewMeeting && (
                <button
                  type="button"
                  onClick={() => {
                    const fallback = projectMeetings[0];
                    setShowRecorderPanel(false);
                    if (fallback) {
                      setSelectedMeetingId(fallback.id);
                      setActiveProjectFile({
                        type: 'meeting',
                        id: fallback.id,
                        folderId: fallback.folderId,
                      });
                    }
                  }}
                  className="text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-800/80 transition"
                >
                  Cancel New Meeting
                </button>
              )}
            </div>
          </div>

          {/* Quick AI Keys Setup Card */}
          {showApiKeyHelper && (
            <div className="mb-4 p-4 rounded-xl bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-800 space-y-3.5 text-xs shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5 text-indigo-600" />
                  Connect Free AI Keys for Accurate Transcription & Summaries:
                </span>
                <button
                  type="button"
                  onClick={() => setShowApiKeyHelper(false)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                {/* Gemini Key Input */}
                <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-700 dark:text-slate-200">Google Gemini API Key</span>
                    <a
                      href="https://aistudio.google.com/apikey"
                      target="_blank"
                      rel="noreferrer"
                      className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline inline-flex items-center gap-0.5"
                    >
                      Get Key ↗
                    </a>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Powers automatic model discovery, meeting summaries, key points & action items.
                  </p>
                  <input
                    type="password"
                    value={state.settings.apiKeys.gemini}
                    onChange={(e) =>
                      updateSettings({
                        apiKeys: { ...state.settings.apiKeys, gemini: e.target.value },
                      })
                    }
                    placeholder="AIzaSy... (Gemini API Key)"
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono text-xs"
                  />
                </div>

                {/* Groq Key Input */}
                <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-700 dark:text-slate-200">Groq Whisper API Key (Free)</span>
                    <a
                      href="https://console.groq.com/keys"
                      target="_blank"
                      rel="noreferrer"
                      className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline inline-flex items-center gap-0.5"
                    >
                      Get Free Key ↗
                    </a>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Recommended for mixed Hebrew + English meetings: instant, highly accurate acoustic Whisper Large v3.
                  </p>
                  <input
                    type="password"
                    value={state.settings.apiKeys.groq || ''}
                    onChange={(e) =>
                      updateSettings({
                        apiKeys: { ...state.settings.apiKeys, groq: e.target.value },
                      })
                    }
                    placeholder="gsk_... (Groq Whisper Key)"
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono text-xs"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  onClick={() => setShowApiKeyHelper(false)}
                  className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs"
                >
                  Save & Close
                </button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
            <input
              type="text"
              dir={detectTextDirection(recordingTitle)}
              value={recordingTitle}
              onChange={(e) => setRecordingTitle(e.target.value)}
              placeholder="Meeting title / כותרת הפגישה..."
              className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />

            {/* Capture Mode Selector */}
            <div className="grid grid-cols-2 gap-1.5 text-xs">
              <button
                type="button"
                disabled={isRecording}
                onClick={() => setCaptureMode('mic_and_system_audio')}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-left transition ${
                  captureMode === 'mic_and_system_audio'
                    ? 'border-indigo-600 bg-indigo-50/90 dark:bg-indigo-950/60 text-indigo-900 dark:text-indigo-200 font-medium'
                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                }`}
              >
                <MonitorSpeaker className="w-4 h-4 text-indigo-600 shrink-0" />
                <span className="truncate">{t.meetings.micAndSystem}</span>
              </button>
              <button
                type="button"
                disabled={isRecording}
                onClick={() => setCaptureMode('mic_only')}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-left transition ${
                  captureMode === 'mic_only'
                    ? 'border-indigo-600 bg-indigo-50/90 dark:bg-indigo-950/60 text-indigo-900 dark:text-indigo-200 font-medium'
                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                }`}
              >
                <Mic className="w-4 h-4 text-indigo-600 shrink-0" />
                <span className="truncate">{t.meetings.micOnly}</span>
              </button>
            </div>
          </div>

          {/* Bilingual Acoustic ASR Status Bar (No Language Selection Needed) */}
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3 px-3 py-2 rounded-xl bg-white/80 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80 text-xs">
            <div className="flex items-center gap-2 text-slate-700 dark:text-slate-200">
              <Languages className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
              <div>
                <span className="font-semibold">
                  Auto Bilingual Acoustic ASR (עברית + English + Code-Switching):
                </span>{' '}
                <span className="text-slate-500 dark:text-slate-400 text-[11px]">
                  {hasGeminiKey
                    ? 'Active — Automatically detects Hebrew sentences, English sentences, and English words inside Hebrew sentences without choosing a language'
                    : 'Connect your Gemini API Key above to enable true bilingual Hebrew + English acoustic recognition'}
                </span>
              </div>
            </div>

            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-violet-100 text-violet-800 dark:bg-violet-950/70 dark:text-violet-300 border border-violet-200 dark:border-violet-800">
              🌐 Auto עברית + English
            </span>
          </div>

          {/* Live User Notes Scratchpad during recording */}
          <textarea
            dir={detectTextDirection(liveUserNotes)}
            value={liveUserNotes}
            onChange={(e) => setLiveUserNotes(e.target.value)}
            rows={3}
            placeholder={t.meetings.liveNotesPlaceholder}
            className="w-full p-2.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-800/90 mb-3 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />

          {!isRecording ? (
            <button
              onClick={startLiveRecording}
              disabled={isTranscribing}
              className="w-full py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-xs transition disabled:opacity-50"
            >
              <Mic className="w-4 h-4" />
              {isTranscribing
                ? 'Summarizing & Finalizing Meeting...'
                : t.meetings.startRecording}
            </button>
          ) : (
            <div className="space-y-3">
              {/* Requirement 2: Live Sound Height Visualizer Bar + Peak Level Meter */}
              <div className="p-3.5 rounded-xl bg-slate-900 text-white border border-slate-800 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping" />
                    <span className="text-xs font-semibold text-rose-300">
                      Recording ({captureMode === 'mic_and_system_audio' ? 'Mic + System' : 'Mic'})
                    </span>
                    <span className="text-[11px] text-slate-400 flex items-center gap-1 ms-2">
                      <Activity className="w-3.5 h-3.5 text-emerald-400" />
                      Input Level: {peakVolumePct}%
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-violet-600/90 text-white">
                      🌐 Auto עברית + EN
                    </span>

                    <div className="flex items-center gap-1 bg-slate-800 rounded-lg p-0.5 text-[11px]">
                      <button
                        type="button"
                        onClick={() => setActiveLiveSpeaker('speaker_1')}
                        className={`px-2 py-0.5 rounded-md font-semibold transition ${
                          activeLiveSpeaker === 'speaker_1'
                            ? 'bg-emerald-600 text-white'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        Speaker 1
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveLiveSpeaker('speaker_2')}
                        className={`px-2 py-0.5 rounded-md font-semibold transition ${
                          activeLiveSpeaker === 'speaker_2'
                            ? 'bg-emerald-600 text-white'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        Speaker 2
                      </button>
                    </div>

                    <span className="font-mono text-sm font-bold text-rose-400 ms-1">
                      {formatDuration(elapsedSec)}
                    </span>
                  </div>
                </div>

                {/* 28-Bar Real-Time Sound Height Equalizer */}
                <div className="h-12 px-2 py-1.5 rounded-lg bg-slate-950/80 border border-slate-800/80 flex items-end justify-between gap-1">
                  {soundBars.map((barHeight, idx) => {
                    const isLoud = barHeight > 70;
                    const isMedium = barHeight > 30;
                    return (
                      <div
                        key={idx}
                        className={`flex-1 rounded-full transition-all duration-75 ${
                          isLoud
                            ? 'bg-rose-500'
                            : isMedium
                            ? 'bg-emerald-400'
                            : 'bg-indigo-500/70'
                        }`}
                        style={{ height: `${barHeight}%` }}
                      />
                    );
                  })}
                </div>

                {/* Live Streaming Bilingual Transcript Feed During Recording */}
                <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800 space-y-1.5 max-h-40 overflow-y-auto text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-400">
                    <span className="font-semibold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                      <span>● Live Bilingual Transcript (עברית + English)</span>
                      {isProcessingLiveChunk && (
                        <span className="px-1.5 py-0.5 rounded bg-violet-950 text-violet-300 border border-violet-700/60 animate-pulse normal-case">
                          Refining Hebrew/English chunk...
                        </span>
                      )}
                    </span>
                    <span>
                      {liveTranscriptSegments.length} segment
                      {liveTranscriptSegments.length === 1 ? '' : 's'} captured
                    </span>
                  </div>

                  {liveTranscriptSegments.length === 0 && !interimSpeechText ? (
                    <p className="text-slate-400 italic text-[11px]">
                      Speak in Hebrew, English, or mix English words inside Hebrew sentences — live words will appear here...
                    </p>
                  ) : (
                    <div className="space-y-1.5">
                      {liveTranscriptSegments.map((seg) => {
                        const badge = getLanguageBadgeInfo(seg.language);
                        return (
                          <div
                            key={seg.id}
                            dir={detectTextDirection(seg.text)}
                            style={{ unicodeBidi: 'plaintext' }}
                            className="text-slate-200 leading-snug flex flex-wrap items-baseline gap-1.5"
                          >
                            <span className="font-mono text-[10px] text-indigo-400">
                              [{formatDuration(seg.startTimeSec)}]
                            </span>
                            <span
                              className={`text-[9px] font-bold px-1.5 py-0.2 rounded border ${badge.className}`}
                            >
                              {badge.label}
                            </span>
                            <span className="font-semibold text-emerald-400">
                              {seg.speakerId === 'speaker_1' ? 'Speaker 1:' : 'Speaker 2:'}
                            </span>
                            <span style={{ unicodeBidi: 'plaintext' }}>{seg.text}</span>
                          </div>
                        );
                      })}
                      {interimSpeechText && (
                        <div
                          dir={detectTextDirection(interimSpeechText)}
                          style={{ unicodeBidi: 'plaintext' }}
                          className="text-indigo-200 italic animate-pulse"
                        >
                          <span className="font-semibold text-emerald-400 me-1.5">
                            {activeLiveSpeaker === 'speaker_1' ? 'Speaker 1:' : 'Speaker 2:'}
                          </span>
                          <span style={{ unicodeBidi: 'plaintext' }}>
                            {interimSpeechText}...
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <button
                onClick={stopAndTranscribeRecording}
                className="w-full py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-semibold text-sm flex items-center justify-center gap-2 transition shadow-sm"
              >
                <Square className="w-4 h-4 fill-current" />
                {t.meetings.stopRecording}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Active Meeting Note Full-Width Editor View (Hidden when creating a New Empty Meeting) */}
      <div>
        {!activeMeeting ? (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-dashed border-slate-300 dark:border-slate-800 p-8 space-y-5">
            <div className="text-center space-y-1.5">
              <div className="w-11 h-11 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mx-auto">
                <Mic className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {recordingTitle.trim() || 'New Empty Meeting / פגישה חדשה'}
              </h3>
              <p className="text-xs text-slate-500 max-w-lg mx-auto">
                This is a brand-new empty meeting workspace. Start recording above — both Hebrew and English (including English words inside Hebrew sentences) will be transcribed and summarized here.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 opacity-75">
              <div className="p-3.5 rounded-xl bg-indigo-50/40 dark:bg-indigo-950/15 border border-indigo-100 dark:border-indigo-900/40">
                <h4 className="text-[11px] font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-300 mb-1">
                  ✨ {t.meetings.summary}
                </h4>
                <p className="text-xs text-slate-400 italic">
                  Will be generated automatically when recording ends...
                </p>
              </div>
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800">
                <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1">
                  📌 {t.meetings.keyPoints} &amp; {t.meetings.decisions}
                </h4>
                <p className="text-xs text-slate-400 italic">
                  Waiting for meeting audio &amp; live notes...
                </p>
              </div>
              <div className="p-3.5 rounded-xl bg-amber-50/30 dark:bg-amber-950/15 border border-amber-200/60 dark:border-amber-900/40">
                <h4 className="text-[11px] font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300 mb-1">
                  🎯 {t.meetings.suggestedTasks}
                </h4>
                <p className="text-xs text-slate-400 italic">
                  Action items will appear here after the meeting...
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 space-y-6 shadow-xs">
            {/* Header */}
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xl">🎙️</span>
                  <input
                    type="text"
                    dir={detectTextDirection(activeMeeting.title)}
                    value={activeMeeting.title}
                    onChange={(e) =>
                      updateMeetingNote(activeMeeting.id, { title: e.target.value })
                    }
                    className="text-xl font-bold text-slate-900 dark:text-white bg-transparent border-b border-transparent hover:border-slate-300 focus:border-indigo-500 focus:outline-none"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2 mt-2 text-xs text-slate-500">
                  <span>{new Date(activeMeeting.recordedAt).toLocaleString()}</span>
                  <span>•</span>
                  <span>Duration: {formatDuration(activeMeeting.durationSec)}</span>
                  <span>•</span>
                  <span className="px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-medium">
                    {activeMeeting.captureMode === 'mic_and_system_audio'
                      ? 'Mic + Windows System Audio'
                      : 'Microphone Only'}
                  </span>
                </div>
              </div>

              {/* Record New Meeting + Audio Retention & Delete Controls */}
              <div className="flex flex-wrap items-center gap-2">
                {!showRecorderPanel && (
                  <button
                    type="button"
                    onClick={openFreshEmptyMeeting}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white transition"
                  >
                    <Mic className="w-3.5 h-3.5" />
                    <span>New Recording</span>
                  </button>
                )}

                {!activeMeeting.audioDeleted && activeMeeting.audioDataUrl && (
                  <button
                    type="button"
                    disabled={isReTranscribing}
                    onClick={handleRetryTranscription}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border border-indigo-200 dark:border-indigo-800 bg-indigo-50/80 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 transition disabled:opacity-50"
                    title="Re-run transcription on the saved audio using Gemini 3.8 Flash"
                  >
                    <RotateCcw className={`w-3.5 h-3.5 ${isReTranscribing ? 'animate-spin' : ''}`} />
                    <span>{isReTranscribing ? 'Transcribing...' : 'Re-transcribe Audio'}</span>
                  </button>
                )}

                {!activeMeeting.audioDeleted ? (
                  <button
                    onClick={() => deleteMeetingOriginalAudio(activeMeeting.id)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border border-amber-200 dark:border-amber-800 bg-amber-50/70 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 hover:bg-amber-100 transition"
                    title="Deletes the raw audio file to save storage while keeping the full transcript and summary"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    {t.meetings.deleteAudio}
                  </button>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs bg-slate-100 dark:bg-slate-800 text-slate-500">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                    {t.meetings.audioDeletedBadge}
                  </span>
                )}

                <button
                  onClick={() => deleteMeetingToTrash(activeMeeting.id)}
                  className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 text-rose-600 hover:bg-rose-50"
                  title="Move meeting note to Trash"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Requirement 3: Accurate Pre-Loaded Progress Bar Audio Player */}
            {!activeMeeting.audioDeleted && activeMeeting.audioDataUrl && (
              <MeetingAudioPlayer
                audioDataUrl={activeMeeting.audioDataUrl}
                fallbackDurationSec={activeMeeting.durationSec}
              />
            )}

            {/* Re-transcription Alert Banner when transcription had failed or returned empty */}
            {!activeMeeting.audioDeleted &&
              activeMeeting.audioDataUrl &&
              (activeMeeting.segments.length === 0 ||
                activeMeeting.summary.startsWith('Transcription failed')) && (
                <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-xs">
                  <div className="space-y-0.5">
                    <span className="font-bold text-amber-900 dark:text-amber-200 block">
                      Audio is safely saved on your device.
                    </span>
                    <span className="text-amber-700 dark:text-amber-400">
                      You can run AI transcription with Gemini 3.8 Flash now:
                    </span>
                  </div>
                  <button
                    type="button"
                    disabled={isReTranscribing}
                    onClick={handleRetryTranscription}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs transition disabled:opacity-50"
                  >
                    <RotateCcw className={`w-3.5 h-3.5 ${isReTranscribing ? 'animate-spin' : ''}`} />
                    <span>{isReTranscribing ? 'Transcribing...' : 'Retry AI Transcription'}</span>
                  </button>
                </div>
              )}

            {/* Post-Meeting Structured Summary, Key Points & Decisions */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 rounded-xl bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/40 md:col-span-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-300 mb-1.5">
                  ✨ {t.meetings.summary}
                </h4>
                <p
                  dir={detectTextDirection(activeMeeting.summary)}
                  className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed whitespace-pre-wrap"
                >
                  {activeMeeting.summary}
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-2">
                  📌 {t.meetings.keyPoints}
                </h4>
                <ul className="space-y-1.5 text-xs text-slate-700 dark:text-slate-300">
                  {activeMeeting.keyPoints.map((kp, i) => (
                    <li key={i} dir={detectTextDirection(kp)} className="flex items-start gap-1.5">
                      <span className="text-indigo-500 font-bold">•</span>
                      <span>{kp}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="p-4 rounded-xl bg-emerald-50/40 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/40">
                <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300 mb-2">
                  ✅ {t.meetings.decisions}
                </h4>
                <ul className="space-y-1.5 text-xs text-slate-700 dark:text-slate-300">
                  {activeMeeting.decisions.map((dec, i) => (
                    <li key={i} dir={detectTextDirection(dec)} className="flex items-start gap-1.5">
                      <span className="text-emerald-600 font-bold">✓</span>
                      <span>{dec}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Interactive Task Suggestions from Meeting */}
            <div className="p-4 rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50/40 dark:bg-amber-950/15">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300">
                  🎯 {t.meetings.suggestedTasks}
                </h4>
                <span className="text-[11px] text-amber-700 dark:text-amber-400">
                  Accepted tasks link back to this meeting note
                </span>
              </div>

              <div className="space-y-2">
                {activeMeeting.taskSuggestions.map((sug) => (
                  <div
                    key={sug.id}
                    className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
                  >
                    <div className="flex-1 min-w-[200px]">
                      {editingSuggestionId === sug.id ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            dir={detectTextDirection(suggestionTitleInput)}
                            value={suggestionTitleInput}
                            onChange={(e) => setSuggestionTitleInput(e.target.value)}
                            className="flex-1 px-2 py-1 text-xs rounded border border-indigo-400 bg-white dark:bg-slate-800"
                          />
                          <button
                            onClick={() => {
                              handleMeetingTaskSuggestion(
                                activeMeeting.id,
                                sug.id,
                                'accept',
                                suggestionTitleInput
                              );
                              setEditingSuggestionId(null);
                            }}
                            className="px-2 py-1 text-xs rounded bg-emerald-600 text-white"
                          >
                            Save & Accept
                          </button>
                        </div>
                      ) : (
                        <>
                          <p
                            dir={detectTextDirection(sug.title)}
                            className={`text-sm font-medium ${
                              sug.status === 'rejected'
                                ? 'line-through text-slate-400'
                                : 'text-slate-800 dark:text-slate-100'
                            }`}
                          >
                            {sug.title}
                          </p>
                          <p className="text-[11px] text-slate-500">
                            Priority: {sug.priority} {sug.dueDate ? `• Due: ${sug.dueDate}` : ''}
                          </p>
                        </>
                      )}
                    </div>

                    {sug.status === 'pending' ? (
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() =>
                            handleMeetingTaskSuggestion(activeMeeting.id, sug.id, 'accept')
                          }
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-emerald-600 text-white hover:bg-emerald-700"
                        >
                          <Check className="w-3.5 h-3.5" /> Accept
                        </button>
                        <button
                          onClick={() => {
                            setEditingSuggestionId(sug.id);
                            setSuggestionTitleInput(sug.title);
                          }}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                        >
                          <Edit3 className="w-3.5 h-3.5" /> Edit
                        </button>
                        <button
                          onClick={() =>
                            handleMeetingTaskSuggestion(activeMeeting.id, sug.id, 'reject')
                          }
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-rose-600 hover:bg-rose-50"
                        >
                          <X className="w-3.5 h-3.5" /> Reject
                        </button>
                      </div>
                    ) : (
                      <span
                        className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                          sug.status === 'accepted'
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                            : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {sug.status === 'accepted' ? '✓ Task Created' : 'Rejected'}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* User Live Notes Section */}
            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-indigo-600" />
                  Your Live Meeting Notes (Combined with Transcript)
                </h4>
              </div>
              <textarea
                dir={detectTextDirection(activeMeeting.userLiveNotes)}
                value={activeMeeting.userLiveNotes}
                onChange={(e) =>
                  updateMeetingNote(activeMeeting.id, { userLiveNotes: e.target.value })
                }
                rows={3}
                placeholder="Add or refine your personal notes from this meeting..."
                className="w-full p-2.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
              />
            </div>

            {/* Speaker Diarization & Bilingual Transcript */}
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                  <UserCheck className="w-4 h-4 text-indigo-600" />
                  Speaker-Diarized Transcript (Hebrew & English)
                </h4>
                <span className="text-[11px] text-slate-400">
                  {t.meetings.speakerRenameHint}
                </span>
              </div>

              {/* Speaker Badges Bar for one-click renaming across transcript */}
              <div className="flex flex-wrap items-center gap-2 pb-2">
                {Object.entries(activeMeeting.speakerLabels).map(([speakerId, label]) => (
                  <div key={speakerId} className="inline-flex items-center">
                    {editingSpeakerId === speakerId ? (
                      <div className="inline-flex items-center gap-1 bg-indigo-50 dark:bg-indigo-950 px-2 py-1 rounded-lg border border-indigo-400">
                        <input
                          type="text"
                          value={speakerNameInput}
                          onChange={(e) => setSpeakerNameInput(e.target.value)}
                          className="text-xs px-1.5 py-0.5 rounded bg-white dark:bg-slate-800 w-28"
                          autoFocus
                        />
                        <button
                          onClick={() => {
                            if (speakerNameInput.trim()) {
                              renameMeetingSpeaker(
                                activeMeeting.id,
                                speakerId,
                                speakerNameInput.trim()
                              );
                            }
                            setEditingSpeakerId(null);
                          }}
                          className="text-xs px-2 py-0.5 rounded bg-indigo-600 text-white"
                        >
                          Save
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          setEditingSpeakerId(speakerId);
                          setSpeakerNameInput(label);
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 transition"
                      >
                        <span>👤 {label}</span>
                        <Edit3 className="w-3 h-3 opacity-60" />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* Diarized Transcript Segments */}
              <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
                {activeMeeting.segments.map((seg) => {
                  const speakerName =
                    activeMeeting.speakerLabels[seg.speakerId] || seg.speakerId;
                  const segDir = detectTextDirection(seg.text);
                  const langBadge = getLanguageBadgeInfo(
                    seg.language || detectSegmentLanguage(seg.text)
                  );
                  return (
                    <div
                      key={seg.id}
                      className="p-3 rounded-xl bg-slate-50/80 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              setEditingSpeakerId(seg.speakerId);
                              setSpeakerNameInput(speakerName);
                            }}
                            className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
                          >
                            {speakerName}
                          </button>
                          <span
                            className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${langBadge.className}`}
                          >
                            {langBadge.label}
                          </span>
                        </div>
                        <span className="text-[11px] font-mono text-slate-400">
                          {formatDuration(seg.startTimeSec)} – {formatDuration(seg.endTimeSec)}
                        </span>
                      </div>
                      <p
                        dir={segDir}
                        style={{ unicodeBidi: 'plaintext' }}
                        className="text-sm text-slate-800 dark:text-slate-200 leading-relaxed"
                      >
                        {seg.text}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
