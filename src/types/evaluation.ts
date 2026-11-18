export type LearningGroup = 'Low' | 'Middle' | 'High';

export interface StudentSession {
  studentName: string;
  className: string;
  absentNumber: string;
  loggedInAt: string;
  activeGroup?: LearningGroup;
  attemptId?: string;
  startedAt?: string;
}

export interface EvaluationPayload {
  attemptId: string;
  studentName: string;
  className: string;
  absentNumber: string;
  group: LearningGroup;
  startedAt: string;
  istima: number;
  kalam: number;
  qiraah: number;
  kitabah: number;
  finalScore: number;
  correctCount: number;
  totalQuestions: number;
  status: string;
}

export interface EvaluationRecord extends EvaluationPayload {
  id: string;
  rowNumber: number;
  evaluationDate: string;
  submittedAt: string;
  syncedToGoogleSheets: boolean;
}

export const SPREADSHEET_SHEET_NAME = 'DATA NILAI SISWA';

export const SPREADSHEET_COLUMNS = [
  'Nomor',
  'Nama Lengkap',
  'Kelas',
  'Nomor Absen',
  'Kelompok Pembelajaran',
  'Tanggal Evaluasi',
  'Waktu Pengumpulan',
  "Nilai Istima' (الاستماع)",
  'Nilai Kalam (الكلام)',
  "Nilai Qira'ah (القراءة)",
  'Nilai Kitabah (الكتابة)',
  'Nilai Akhir',
  'Jumlah Jawaban Benar',
  'Jumlah Soal',
  'Status Pengerjaan',
] as const;

export const ALLOWED_ELKPD_ORIGINS = [
  'https://e-lkpdbahasaarabkelas7kelompok1.netlify.app',
  'https://e-lkdpbahasaarabkelas7kelompok2.netlify.app',
  'https://e-lkpdbahasaarabkelas7kelompok3.netlify.app',
] as const;
