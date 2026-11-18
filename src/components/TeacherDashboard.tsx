import {
  AlertCircle,
  ArrowLeft,
  Check,
  Copy,
  Download,
  Eye,
  EyeOff,
  FileSpreadsheet,
  Lock,
  LogOut,
  RefreshCw,
  Search,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  SPREADSHEET_COLUMNS,
  SPREADSHEET_SHEET_NAME,
  type EvaluationRecord,
  type LearningGroup,
} from '../types/evaluation';

interface TeacherDashboardProps {
  onBackToPortal: () => void;
}

const STANDARD_CLASSES = ['VII-A', 'VII-B', 'VII-C', 'VII-D', 'VII-E', 'VII-F', 'VII-G', 'VII-H'];

const APPS_SCRIPT_TEMPLATE = `// Google Apps Script (Code.gs) — Deploy sebagai Web App (Execute as: Me, Access: Anyone)
const SHEET_NAME = '${SPREADSHEET_SHEET_NAME}';
const HEADERS = ${JSON.stringify(SPREADSHEET_COLUMNS, null, 2)};

function getOrCreateSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const payload = JSON.parse(e.postData.contents);
    const r = payload.record || payload;
    const sheet = getOrCreateSheet();
    const rowNumber = Math.max(1, sheet.getLastRow());
    sheet.appendRow([
      rowNumber,
      r.studentName,
      r.className,
      r.absentNumber,
      r.group,
      r.evaluationDate,
      r.submittedAt,
      r.istima,
      r.kalam,
      r.qiraah,
      r.kitabah,
      r.finalScore,
      r.correctCount,
      r.totalQuestions,
      r.status,
    ]);
    return ContentService.createTextOutput(JSON.stringify({ ok: true, rowNumber }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}

function doGet() {
  const sheet = getOrCreateSheet();
  const values = sheet.getDataRange().getValues();
  if (values.length <= 1) {
    return ContentService.createTextOutput(JSON.stringify({ ok: true, records: [] }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  const records = values.slice(1).map((row, idx) => ({
    id: 'gs-' + idx,
    rowNumber: Number(row[0]) || idx + 1,
    studentName: String(row[1] || ''),
    className: String(row[2] || ''),
    absentNumber: String(row[3] || ''),
    group: String(row[4] || 'Low'),
    evaluationDate: String(row[5] || ''),
    submittedAt: String(row[6] || ''),
    istima: Number(row[7]) || 0,
    kalam: Number(row[8]) || 0,
    qiraah: Number(row[9]) || 0,
    kitabah: Number(row[10]) || 0,
    finalScore: Number(row[11]) || 0,
    correctCount: Number(row[12]) || 0,
    totalQuestions: Number(row[13]) || 0,
    status: String(row[14] || 'Selesai'),
    attemptId: 'gs-' + idx,
    startedAt: '',
    syncedToGoogleSheets: true,
  }));
  return ContentService.createTextOutput(JSON.stringify({ ok: true, records }))
    .setMimeType(ContentService.MimeType.JSON);
}`;

const POSTMESSAGE_BRIDGE_SNIPPET = `// Pasang fungsi ini di akhir evaluasi pada website Low, Middle, dan High
// tanpa mengubah desain, soal, atau alur belajar asli.
export function submitEvaluationToPortal(scores) {
  const params = new URLSearchParams(window.location.search);
  const payload = {
    attemptId: params.get('attemptId') || (crypto.randomUUID ? crypto.randomUUID() : String(Date.now())),
    istima: Number(scores.istima),         // Nilai 0 - 100
    kalam: Number(scores.kalam),           // Nilai 0 - 100
    qiraah: Number(scores.qiraah),         // Nilai 0 - 100
    kitabah: Number(scores.kitabah),       // Nilai 0 - 100
    finalScore: Number(scores.finalScore), // Nilai akhir 0 - 100
    correctCount: Number(scores.correctCount),
    totalQuestions: Number(scores.totalQuestions),
    status: 'Selesai',
  };

  if (window.parent && window.parent !== window) {
    window.parent.postMessage(
      { type: 'ELKPD_EVALUATION_SUBMIT', payload },
      '*'
    );
  }
}`;

export function TeacherDashboard({ onBackToPortal }: TeacherDashboardProps) {
  const [authChecked, setAuthChecked] = useState(false);
  const [teacherName, setTeacherName] = useState<string | null>(null);
  const [username, setUsername] = useState('guru');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const [activeTab, setActiveTab] = useState<'grades' | 'sheets'>('grades');
  const [evaluations, setEvaluations] = useState<EvaluationRecord[]>([]);
  const [appsScriptConnected, setAppsScriptConnected] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [groupFilter, setGroupFilter] = useState<'Semua' | LearningGroup>('Semua');
  const [classFilter, setClassFilter] = useState<string>('Semua');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const fetchEvaluations = useCallback(async () => {
    setIsLoadingData(true);
    setDataError(null);
    try {
      const res = await fetch('/api/teacher/evaluations');
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        evaluations?: EvaluationRecord[];
        appsScriptConnected?: boolean;
      };
      if (res.status === 401) {
        setTeacherName(null);
        return;
      }
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Gagal memuat data nilai siswa.');
      }
      setEvaluations(Array.isArray(data.evaluations) ? data.evaluations : []);
      setAppsScriptConnected(Boolean(data.appsScriptConnected));
    } catch (err) {
      setDataError(err instanceof Error ? err.message : 'Gagal memuat data nilai siswa.');
    } finally {
      setIsLoadingData(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    fetch('/api/teacher/session')
      .then((res) => res.json())
      .then((data: { authenticated?: boolean; teacherName?: string }) => {
        if (!active) return;
        if (data.authenticated && data.teacherName) {
          setTeacherName(data.teacherName);
        }
      })
      .catch(() => {
        // Ignore initial check failure
      })
      .finally(() => {
        if (active) setAuthChecked(true);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (teacherName) {
      void fetchEvaluations();
    }
  }, [teacherName, fetchEvaluations]);

  const handleTeacherLogin = async (e: FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setIsLoggingIn(true);
    try {
      const res = await fetch('/api/teacher/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string; teacherName?: string };
      if (!res.ok || !data.ok || !data.teacherName) {
        throw new Error(data.error || 'Username atau kata sandi guru salah.');
      }
      setTeacherName(data.teacherName);
      setPassword('');
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : 'Gagal masuk ke Dashboard Guru.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    await fetch('/api/teacher/logout', { method: 'POST' });
    setTeacherName(null);
    setEvaluations([]);
  };

  const availableClasses = useMemo(() => {
    const set = new Set<string>(STANDARD_CLASSES);
    for (const item of evaluations) {
      if (item.className) set.add(item.className);
    }
    return Array.from(set);
  }, [evaluations]);

  const filteredEvaluations = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return evaluations.filter((item) => {
      if (groupFilter !== 'Semua' && item.group !== groupFilter) return false;
      if (classFilter !== 'Semua' && item.className !== classFilter) return false;
      if (q) {
        const matchName = item.studentName.toLowerCase().includes(q);
        const matchAbsent = item.absentNumber.toLowerCase().includes(q);
        if (!matchName && !matchAbsent) return false;
      }
      return true;
    });
  }, [evaluations, groupFilter, classFilter, searchQuery]);

  const stats = useMemo(() => {
    if (filteredEvaluations.length === 0) {
      return {
        count: 0,
        avgFinal: '0.0',
        avgIstimaKalam: '0.0',
        avgQiraahKitabah: '0.0',
      };
    }
    const total = filteredEvaluations.length;
    const sumFinal = filteredEvaluations.reduce((acc, r) => acc + r.finalScore, 0);
    const sumIK = filteredEvaluations.reduce((acc, r) => acc + (r.istima + r.kalam) / 2, 0);
    const sumQK = filteredEvaluations.reduce((acc, r) => acc + (r.qiraah + r.kitabah) / 2, 0);
    return {
      count: total,
      avgFinal: (sumFinal / total).toFixed(1),
      avgIstimaKalam: (sumIK / total).toFixed(1),
      avgQiraahKitabah: (sumQK / total).toFixed(1),
    };
  }, [filteredEvaluations]);

  const handleCopyText = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), 2000);
    } catch {
      // Clipboard fallback ignored
    }
  };

  const handleDownloadTemplateCsv = () => {
    const headerRow = SPREADSHEET_COLUMNS.map((col) =>
      col.includes(',') ? `"${col}"` : col
    ).join(',');
    const blob = new Blob([`\uFEFF${headerRow}\r\n`], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'TEMPLATE_DATA_NILAI_SISWA.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const exportUrl = `/api/teacher/export?group=${encodeURIComponent(groupFilter)}&className=${encodeURIComponent(classFilter)}`;

  if (!authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-600 text-sm">
        Memeriksa sesi guru...
      </div>
    );
  }

  if (!teacherName) {
    return (
      <div className="min-h-screen flex flex-col bg-slate-50">
        <header className="border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
            <button
              type="button"
              onClick={onBackToPortal}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs sm:text-sm font-semibold text-slate-700 hover:bg-slate-50 min-h-[40px]"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              <span>Kembali ke Portal Siswa</span>
            </button>
            <span className="font-display text-sm font-bold text-slate-900">
              Portal Khusus Guru
            </span>
          </div>
        </header>

        <main className="flex flex-1 items-center justify-center px-4 py-12">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-7 shadow-sm sm:p-8">
            <div className="flex flex-col items-center text-center space-y-2">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
                <Lock className="h-6 w-6" aria-hidden="true" />
              </div>
              <h1 className="font-display text-2xl font-bold text-slate-900">
                Login Dashboard Guru
              </h1>
              <p className="text-sm text-slate-600">
                Masuk menggunakan akun guru untuk melihat rekap nilai evaluasi dan mengelola integrasi
                Google Sheets.
              </p>
            </div>

            <form onSubmit={handleTeacherLogin} className="mt-6 space-y-4">
              {loginError && (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-800"
                >
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" aria-hidden="true" />
                  <span>{loginError}</span>
                </div>
              )}

              <div>
                <label
                  htmlFor="teacher-username"
                  className="block text-sm font-semibold text-slate-800 mb-1.5"
                >
                  Username Guru
                </label>
                <input
                  id="teacher-username"
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  className="w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 focus:border-teal-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-600/20 min-h-[44px]"
                />
              </div>

              <div>
                <label
                  htmlFor="teacher-password"
                  className="block text-sm font-semibold text-slate-800 mb-1.5"
                >
                  Kata Sandi Guru
                </label>
                <div className="relative">
                  <input
                    id="teacher-password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Masukkan kata sandi guru"
                    autoComplete="current-password"
                    className="w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-2.5 pr-11 text-sm text-slate-900 focus:border-teal-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-600/20 min-h-[44px]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? 'Sembunyikan kata sandi' : 'Lihat kata sandi'}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-500 hover:bg-slate-200/60"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoggingIn}
                className="w-full rounded-xl bg-teal-700 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-teal-800 disabled:opacity-60 min-h-[44px]"
              >
                {isLoggingIn ? 'Memverifikasi...' : 'Masuk ke Dashboard Guru'}
              </button>
            </form>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      {/* Top Workspace Header */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onBackToPortal}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs sm:text-sm font-semibold text-slate-700 hover:bg-slate-50 min-h-[40px]"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              <span>Beranda</span>
            </button>
            <div>
              <h1 className="font-display text-base sm:text-lg font-bold text-slate-900">
                Dashboard Evaluasi Guru
              </h1>
              <p className="text-xs text-slate-500">
                Masuk sebagai {teacherName} · Sheet {SPREADSHEET_SHEET_NAME}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => setActiveTab('grades')}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors ${
                  activeTab === 'grades'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Data Nilai Siswa
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('sheets')}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors ${
                  activeTab === 'sheets'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Template & Google Sheets
              </button>
            </div>

            <button
              type="button"
              onClick={() => void handleLogout()}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 min-h-[40px]"
            >
              <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Keluar</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6">
        {activeTab === 'grades' ? (
          <div className="space-y-6">
            {/* Summary Metrics */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-slate-200 bg-white p-5">
                <p className="text-xs font-medium text-slate-500">Siswa Selesai Evaluasi</p>
                <p className="mt-2 font-display text-3xl font-bold tabular-nums text-slate-900">
                  {stats.count}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-5">
                <p className="text-xs font-medium text-slate-500">Rata-Rata Nilai Akhir</p>
                <p className="mt-2 font-display text-3xl font-bold tabular-nums text-teal-700">
                  {stats.avgFinal}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-5">
                <p className="text-xs font-medium text-slate-500">
                  Rata-Rata Istima&apos; &amp; Kalam
                </p>
                <p className="mt-2 font-display text-3xl font-bold tabular-nums text-slate-900">
                  {stats.avgIstimaKalam}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-5">
                <p className="text-xs font-medium text-slate-500">
                  Rata-Rata Qira&apos;ah &amp; Kitabah
                </p>
                <p className="mt-2 font-display text-3xl font-bold tabular-nums text-slate-900">
                  {stats.avgQiraahKitabah}
                </p>
              </div>
            </div>

            {/* Filter & Action Toolbar */}
            <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-1 flex-wrap items-center gap-3">
                <div className="relative min-w-[220px] flex-1 max-w-xs">
                  <Search
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                    aria-hidden="true"
                  />
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Cari nama atau no. absen..."
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm text-slate-900 focus:border-teal-600 focus:bg-white focus:outline-none min-h-[40px]"
                  />
                </div>

                <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1">
                  {(['Semua', 'Low', 'Middle', 'High'] as const).map((grp) => (
                    <button
                      key={grp}
                      type="button"
                      onClick={() => setGroupFilter(grp)}
                      className={`rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors ${
                        groupFilter === grp
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {grp}
                    </button>
                  ))}
                </div>

                <select
                  aria-label="Filter kelas"
                  value={classFilter}
                  onChange={(e) => setClassFilter(e.target.value)}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 focus:border-teal-600 focus:bg-white focus:outline-none min-h-[40px]"
                >
                  <option value="Semua">Semua Kelas</option>
                  {availableClasses.map((cls) => (
                    <option key={cls} value={cls}>
                      {cls}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => void fetchEvaluations()}
                  disabled={isLoadingData}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 min-h-[40px]"
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 ${isLoadingData ? 'animate-spin' : ''}`}
                    aria-hidden="true"
                  />
                  <span>Muat Ulang</span>
                </button>

                <a
                  href={exportUrl}
                  download="DATA_NILAI_SISWA_ELKPD.csv"
                  className="inline-flex items-center gap-1.5 rounded-xl bg-teal-700 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-800 min-h-[40px]"
                >
                  <Download className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Unduh CSV / Excel</span>
                </a>
              </div>
            </div>

            {dataError && (
              <div
                role="alert"
                className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
              >
                <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{dataError}</span>
              </div>
            )}

            {/* 15-Column Evaluation Data Table */}
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              {isLoadingData ? (
                <div className="p-8 text-center text-sm text-slate-500">
                  Memuat data evaluasi siswa...
                </div>
              ) : filteredEvaluations.length === 0 ? (
                <div className="flex flex-col items-center justify-center px-6 py-14 text-center space-y-3">
                  <FileSpreadsheet className="h-10 w-10 text-slate-300" aria-hidden="true" />
                  <h2 className="font-display text-lg font-bold text-slate-900">
                    Belum Ada Data Evaluasi Siswa
                  </h2>
                  <p className="max-w-lg text-sm leading-relaxed text-slate-600">
                    Data hanya akan tercatat setelah siswa benar-benar masuk, mengerjakan evaluasi
                    pada kelompok Low, Middle, atau High, dan mengirimkan nilai asli ke server.
                    Buka tab <strong>Template &amp; Google Sheets</strong> untuk mengunduh template
                    dan melihat kode integrasi.
                  </p>
                  <button
                    type="button"
                    onClick={() => setActiveTab('sheets')}
                    className="rounded-xl border border-teal-600 bg-teal-50 px-4 py-2 text-xs font-semibold text-teal-800 hover:bg-teal-100"
                  >
                    Buka Pengaturan Template &amp; Google Sheets
                  </button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                        <th className="px-3 py-3 font-semibold whitespace-nowrap">No</th>
                        <th className="px-3 py-3 font-semibold whitespace-nowrap">Nama Lengkap</th>
                        <th className="px-3 py-3 font-semibold whitespace-nowrap">Kelas</th>
                        <th className="px-3 py-3 font-semibold whitespace-nowrap text-right">
                          Absen
                        </th>
                        <th className="px-3 py-3 font-semibold whitespace-nowrap">Kelompok</th>
                        <th className="px-3 py-3 font-semibold whitespace-nowrap">Tanggal</th>
                        <th className="px-3 py-3 font-semibold whitespace-nowrap">Waktu</th>
                        <th className="px-3 py-3 font-semibold whitespace-nowrap text-right">
                          Istima&apos;
                        </th>
                        <th className="px-3 py-3 font-semibold whitespace-nowrap text-right">
                          Kalam
                        </th>
                        <th className="px-3 py-3 font-semibold whitespace-nowrap text-right">
                          Qira&apos;ah
                        </th>
                        <th className="px-3 py-3 font-semibold whitespace-nowrap text-right">
                          Kitabah
                        </th>
                        <th className="px-3 py-3 font-semibold whitespace-nowrap text-right">
                          Nilai Akhir
                        </th>
                        <th className="px-3 py-3 font-semibold whitespace-nowrap text-right">
                          Benar / Soal
                        </th>
                        <th className="px-3 py-3 font-semibold whitespace-nowrap">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredEvaluations.map((row, idx) => (
                        <tr key={row.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="px-3 py-3 tabular-nums text-slate-500">{idx + 1}</td>
                          <td className="px-3 py-3 font-semibold text-slate-900 whitespace-nowrap">
                            {row.studentName}
                          </td>
                          <td className="px-3 py-3 text-slate-700 whitespace-nowrap">
                            {row.className}
                          </td>
                          <td className="px-3 py-3 tabular-nums text-right text-slate-700">
                            {row.absentNumber}
                          </td>
                          <td className="px-3 py-3 font-medium text-slate-800 whitespace-nowrap">
                            {row.group}
                          </td>
                          <td className="px-3 py-3 tabular-nums text-slate-600 whitespace-nowrap">
                            {row.evaluationDate}
                          </td>
                          <td className="px-3 py-3 tabular-nums text-slate-600 whitespace-nowrap">
                            {row.submittedAt}
                          </td>
                          <td className="px-3 py-3 tabular-nums text-right text-slate-800">
                            {row.istima}
                          </td>
                          <td className="px-3 py-3 tabular-nums text-right text-slate-800">
                            {row.kalam}
                          </td>
                          <td className="px-3 py-3 tabular-nums text-right text-slate-800">
                            {row.qiraah}
                          </td>
                          <td className="px-3 py-3 tabular-nums text-right text-slate-800">
                            {row.kitabah}
                          </td>
                          <td className="px-3 py-3 tabular-nums text-right font-bold text-teal-800">
                            {row.finalScore}
                          </td>
                          <td className="px-3 py-3 tabular-nums text-right text-slate-700 whitespace-nowrap">
                            {row.correctCount} / {row.totalQuestions}
                          </td>
                          <td className="px-3 py-3 text-emerald-700 font-semibold whitespace-nowrap">
                            {row.status}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Connection Status & Template Card */}
            <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="font-display text-lg font-bold text-slate-900">
                    Template Google Sheets ({SPREADSHEET_SHEET_NAME})
                  </h2>
                  <p className="mt-1 text-sm text-slate-600">
                    Status koneksi server:{' '}
                    <span className="font-semibold text-slate-900">
                      {appsScriptConnected
                        ? 'Terhubung ke Google Apps Script Web App'
                        : 'Penyimpanan Server Portal (Tambahkan APPS_SCRIPT_WEBHOOK_URL di environment server untuk sinkronisasi otomatis ke Google Sheets)'}
                    </span>
                  </p>
                </div>

                <div className="flex flex-wrap gap-2.5">
                  <button
                    type="button"
                    onClick={() => void handleCopyText('headers', SPREADSHEET_COLUMNS.join('\t'))}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 min-h-[40px]"
                  >
                    {copiedId === 'headers' ? (
                      <Check className="h-3.5 w-3.5 text-emerald-600" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                    <span>{copiedId === 'headers' ? 'Header Disalin' : 'Salin 15 Header'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleDownloadTemplateCsv}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-teal-700 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-800 min-h-[40px]"
                  >
                    <Download className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Unduh Template CSV</span>
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-semibold text-slate-700 mb-2">
                  Struktur 15 Kolom Sheet &ldquo;{SPREADSHEET_SHEET_NAME}&rdquo;:
                </p>
                <p className="text-xs text-slate-600 leading-relaxed">
                  {SPREADSHEET_COLUMNS.map((col, idx) => `${idx + 1}. ${col}`).join(' · ')}
                </p>
              </div>
            </div>

            {/* Google Apps Script Web App Snippet */}
            <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-display text-base font-bold text-slate-900">
                    1. Kode Google Apps Script (Code.gs)
                  </h3>
                  <p className="text-xs text-slate-600">
                    Tempel ke Extensions → Apps Script di Google Spreadsheet Anda, lalu Deploy sebagai
                    Web App dan simpan URL-nya pada variabel server APPS_SCRIPT_WEBHOOK_URL.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void handleCopyText('apps-script', APPS_SCRIPT_TEMPLATE)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 min-h-[40px]"
                >
                  {copiedId === 'apps-script' ? (
                    <Check className="h-3.5 w-3.5 text-emerald-600" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                  <span>{copiedId === 'apps-script' ? 'Tersalin' : 'Salin Code.gs'}</span>
                </button>
              </div>
              <pre className="max-h-72 overflow-auto rounded-xl bg-slate-900 p-4 text-xs text-slate-100 font-mono">
                <code>{APPS_SCRIPT_TEMPLATE}</code>
              </pre>
            </div>

            {/* Cross-origin postMessage Bridge Snippet for the 3 Netlify E-LKPD Sites */}
            <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-display text-base font-bold text-slate-900">
                    2. Kode Pengiriman Nilai Asli dari Website E-LKPD (postMessage)
                  </h3>
                  <p className="text-xs text-slate-600">
                    Tambahkan fungsi ini pada akhir evaluasi di repository Kelompok 1 (Low),
                    Kelompok 2 (Middle), dan Kelompok 3 (High) tanpa mengubah soal maupun desain
                    aslinya.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void handleCopyText('bridge', POSTMESSAGE_BRIDGE_SNIPPET)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 min-h-[40px]"
                >
                  {copiedId === 'bridge' ? (
                    <Check className="h-3.5 w-3.5 text-emerald-600" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                  <span>{copiedId === 'bridge' ? 'Tersalin' : 'Salin Bridge Script'}</span>
                </button>
              </div>
              <pre className="max-h-72 overflow-auto rounded-xl bg-slate-900 p-4 text-xs text-slate-100 font-mono">
                <code>{POSTMESSAGE_BRIDGE_SNIPPET}</code>
              </pre>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
