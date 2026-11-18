import { AlertTriangle, ArrowLeft, CheckCircle2, ExternalLink, Loader2, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LEARNING_LEVELS, type LearningLevel } from '../data/portalData';
import {
  ALLOWED_ELKPD_ORIGINS,
  type EvaluationPayload,
  type LearningGroup,
  type StudentSession,
} from '../types/evaluation';

interface ElkbdViewerProps {
  activeLevel: LearningLevel;
  studentSession: StudentSession;
  onBackHome: () => void;
  onSwitchLevel: (level: LearningLevel) => void;
}

type SubmissionState =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'success'; syncedToGoogleSheets: boolean; finalScore: number }
  | { kind: 'error'; message: string; payload: EvaluationPayload };

function mapLevelIdToGroup(id: LearningLevel['id']): LearningGroup {
  if (id === 'low') return 'Low';
  if (id === 'middle') return 'Middle';
  return 'High';
}

export function ElkbdViewer({
  activeLevel,
  studentSession,
  onBackHome,
  onSwitchLevel,
}: ElkbdViewerProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [submissionState, setSubmissionState] = useState<SubmissionState>({ kind: 'idle' });
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const submittedAttemptIdsRef = useRef<Set<string>>(new Set());

  const targetOrigin = useMemo(() => {
    try {
      return new URL(activeLevel.url).origin;
    } catch {
      return '';
    }
  }, [activeLevel.url]);

  const activeGroup = mapLevelIdToGroup(activeLevel.id);

  const iframeSrc = useMemo(() => {
    try {
      const url = new URL(activeLevel.url);
      url.searchParams.set('studentName', studentSession.studentName);
      url.searchParams.set('studentClass', studentSession.className);
      url.searchParams.set('absentNumber', studentSession.absentNumber);
      url.searchParams.set('group', activeGroup);
      if (studentSession.attemptId) {
        url.searchParams.set('attemptId', studentSession.attemptId);
      }
      if (studentSession.startedAt) {
        url.searchParams.set('startedAt', studentSession.startedAt);
      }
      return url.toString();
    } catch {
      return activeLevel.url;
    }
  }, [activeLevel.url, activeGroup, studentSession]);

  const sendEvaluationToServer = useCallback(async (payload: EvaluationPayload) => {
    setSubmissionState({ kind: 'submitting' });
    try {
      const response = await fetch('/api/evaluations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        syncedToGoogleSheets?: boolean;
      };

      if (!response.ok || !result.ok) {
        throw new Error(result.error || 'Server gagal memproses nilai evaluasi.');
      }

      submittedAttemptIdsRef.current.add(payload.attemptId);
      setSubmissionState({
        kind: 'success',
        syncedToGoogleSheets: Boolean(result.syncedToGoogleSheets),
        finalScore: payload.finalScore,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Gagal mengirim hasil evaluasi ke server.';
      setSubmissionState({ kind: 'error', message, payload });
    }
  }, []);

  // Reset frame state when switching groups
  useEffect(() => {
    setIsLoading(true);
    setHasError(false);
    setSubmissionState({ kind: 'idle' });
  }, [activeLevel.id]);

  // Listen for genuine evaluation submissions via cross-origin postMessage
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (!ALLOWED_ELKPD_ORIGINS.includes(event.origin as (typeof ALLOWED_ELKPD_ORIGINS)[number])) {
        return;
      }
      const data = event.data as {
        type?: unknown;
        payload?: Record<string, unknown>;
      } | null;
      if (!data || data.type !== 'ELKPD_EVALUATION_SUBMIT' || !data.payload) {
        return;
      }

      const raw = data.payload;
      const attemptId =
        typeof raw.attemptId === 'string' && raw.attemptId.trim()
          ? raw.attemptId.trim()
          : studentSession.attemptId || '';

      if (!attemptId || submittedAttemptIdsRef.current.has(attemptId)) {
        return;
      }

      const istima = Number(raw.istima);
      const kalam = Number(raw.kalam);
      const qiraah = Number(raw.qiraah);
      const kitabah = Number(raw.kitabah);
      const finalScore = Number(raw.finalScore);
      const correctCount = Number(raw.correctCount);
      const totalQuestions = Number(raw.totalQuestions);

      if (
        !Number.isFinite(istima) ||
        !Number.isFinite(kalam) ||
        !Number.isFinite(qiraah) ||
        !Number.isFinite(kitabah) ||
        !Number.isFinite(finalScore) ||
        !Number.isFinite(correctCount) ||
        !Number.isFinite(totalQuestions) ||
        totalQuestions <= 0
      ) {
        setSubmissionState({
          kind: 'error',
          message: 'Data nilai evaluasi yang diterima dari E-LKPD tidak lengkap.',
          payload: {
            attemptId,
            studentName: studentSession.studentName,
            className: studentSession.className,
            absentNumber: studentSession.absentNumber,
            group: activeGroup,
            startedAt: studentSession.startedAt || new Date().toISOString(),
            istima: 0,
            kalam: 0,
            qiraah: 0,
            kitabah: 0,
            finalScore: 0,
            correctCount: 0,
            totalQuestions: 0,
            status: 'Gagal',
          },
        });
        return;
      }

      const payload: EvaluationPayload = {
        attemptId,
        studentName: studentSession.studentName,
        className: studentSession.className,
        absentNumber: studentSession.absentNumber,
        group: activeGroup,
        startedAt: studentSession.startedAt || new Date().toISOString(),
        istima,
        kalam,
        qiraah,
        kitabah,
        finalScore,
        correctCount,
        totalQuestions,
        status: typeof raw.status === 'string' && raw.status.trim() ? raw.status.trim() : 'Selesai',
      };

      void sendEvaluationToServer(payload);
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [activeGroup, sendEvaluationToServer, studentSession]);

  const handleIframeLoad = () => {
    setIsLoading(false);
    if (iframeRef.current?.contentWindow && targetOrigin) {
      iframeRef.current.contentWindow.postMessage(
        {
          type: 'ELKPD_STUDENT_SESSION',
          payload: {
            studentName: studentSession.studentName,
            className: studentSession.className,
            absentNumber: studentSession.absentNumber,
            group: activeGroup,
            attemptId: studentSession.attemptId,
            startedAt: studentSession.startedAt,
          },
        },
        targetOrigin
      );
    }
  };

  return (
    <div className="flex h-screen flex-col bg-slate-100">
      {/* Top Integrated Workspace Bar */}
      <header className="border-b border-slate-200 bg-white px-4 py-2.5 sm:px-6">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={onBackHome}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs sm:text-sm font-semibold text-slate-700 whitespace-nowrap shrink-0 transition-colors hover:bg-slate-50 hover:text-teal-800 hover:border-teal-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 min-h-[40px]"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              <span>Kembali ke Beranda</span>
            </button>

            <div className="hidden lg:flex items-center gap-2 text-xs text-slate-600 truncate">
              <span className="font-semibold text-slate-900">
                Selamat belajar, {studentSession.studentName}!
              </span>
              <span aria-hidden="true">·</span>
              <span>Kelas {studentSession.className}</span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">Absen {studentSession.absentNumber}</span>
              <span aria-hidden="true">·</span>
              <span className="font-semibold text-teal-800">{activeLevel.name}</span>
            </div>
          </div>

          <div
            role="tablist"
            aria-label="Pindah kelompok E-LKPD"
            className="hidden sm:flex items-center gap-1 rounded-xl bg-slate-100 p-1"
          >
            {LEARNING_LEVELS.map((level) => {
              const isSelected = level.id === activeLevel.id;
              return (
                <button
                  key={level.id}
                  type="button"
                  role="tab"
                  aria-selected={isSelected}
                  onClick={() => onSwitchLevel(level)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
                    isSelected
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {level.name.replace(' LEVEL', '')}
                </button>
              );
            })}
          </div>

          <a
            href={iframeSrc}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-xl bg-teal-700 px-3.5 py-2 text-xs sm:text-sm font-semibold text-white whitespace-nowrap shrink-0 transition-colors hover:bg-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 min-h-[40px]"
          >
            <span>Buka di Halaman Penuh</span>
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
          </a>
        </div>
      </header>

      {/* Submission Status Notification Banner (only on real submission or error) */}
      {submissionState.kind === 'submitting' && (
        <div className="border-b border-sky-200 bg-sky-50 px-4 py-2.5 text-center text-xs sm:text-sm font-medium text-sky-900">
          <span className="inline-flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            <span>Mengirim hasil evaluasi ke server...</span>
          </span>
        </div>
      )}

      {submissionState.kind === 'success' && (
        <div
          role="status"
          className="border-b border-emerald-200 bg-emerald-50 px-4 py-3 text-center text-xs sm:text-sm font-semibold text-emerald-900"
        >
          <span className="inline-flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-700 shrink-0" aria-hidden="true" />
            <span>
              Alhamdulillah! Evaluasi telah selesai. Nilaimu berhasil disimpan (Nilai Akhir:{' '}
              <span className="tabular-nums">{submissionState.finalScore}</span>
              {submissionState.syncedToGoogleSheets ? ' · Tersinkron ke Google Spreadsheet' : ''}).
            </span>
          </span>
        </div>
      )}

      {submissionState.kind === 'error' && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-center gap-3 border-b border-rose-200 bg-rose-50 px-4 py-2.5 text-xs sm:text-sm font-medium text-rose-900"
        >
          <span className="inline-flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-rose-700 shrink-0" aria-hidden="true" />
            <span>{submissionState.message}</span>
          </span>
          {submissionState.payload.totalQuestions > 0 && (
            <button
              type="button"
              onClick={() => void sendEvaluationToServer(submissionState.payload)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-rose-300 bg-white px-3 py-1 text-xs font-semibold text-rose-800 hover:bg-rose-100"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Coba Kirim Ulang</span>
            </button>
          )}
        </div>
      )}

      {/* Embedded Original E-LKPD Frame */}
      <main className="relative flex-1 overflow-hidden bg-white">
        {isLoading && !hasError && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-slate-50/95 p-6 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-teal-700" aria-hidden="true" />
            <p className="mt-3 font-display text-base font-semibold text-slate-900">
              Memuat {activeLevel.name} ({activeLevel.groupLabel}) untuk {studentSession.studentName}...
            </p>
            <p className="mt-1 max-w-md text-sm text-slate-600">
              Identitas siswa diteruskan secara otomatis tanpa mengubah materi dan fitur asli E-LKPD.
            </p>
            <a
              href={iframeSrc}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-teal-700 underline underline-offset-4 hover:text-teal-900"
            >
              <span>Atau buka langsung di tab baru</span>
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          </div>
        )}

        {hasError ? (
          <div className="flex h-full flex-col items-center justify-center p-6 text-center">
            <div className="max-w-md rounded-2xl border border-slate-200 bg-slate-50 p-6 space-y-4">
              <h2 className="font-display text-xl font-bold text-slate-900">
                Tampilan Sematan Tidak Tersedia
              </h2>
              <p className="text-sm leading-relaxed text-slate-600">
                Peramban tidak dapat memuat halaman {activeLevel.name} di dalam bingkai sematan.
                Silakan buka website E-LKPD asli secara langsung menggunakan tombol di bawah ini.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center pt-1">
                <a
                  href={iframeSrc}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 min-h-[44px]"
                >
                  <span>Buka Website Asli</span>
                  <ExternalLink className="h-4 w-4" aria-hidden="true" />
                </a>
                <button
                  type="button"
                  onClick={onBackHome}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100 min-h-[44px]"
                >
                  <span>Kembali ke Beranda</span>
                </button>
              </div>
            </div>
          </div>
        ) : (
          <iframe
            ref={iframeRef}
            key={activeLevel.id}
            src={iframeSrc}
            title={`E-LKPD Bahasa Arab ${activeLevel.name} - ${activeLevel.groupLabel}`}
            onLoad={handleIframeLoad}
            onError={() => {
              setIsLoading(false);
              setHasError(true);
            }}
            allow="autoplay; microphone; camera; fullscreen; clipboard-read; clipboard-write"
            className="h-full w-full border-0"
          />
        )}
      </main>
    </div>
  );
}
