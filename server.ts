import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import express, { type NextFunction, type Request, type Response } from 'express';

dotenv.config();

type LearningGroup = 'Low' | 'Middle' | 'High';

interface EvaluationRecord {
  id: string;
  rowNumber: number;
  attemptId: string;
  studentName: string;
  className: string;
  absentNumber: string;
  group: LearningGroup;
  startedAt: string;
  evaluationDate: string;
  submittedAt: string;
  istima: number;
  kalam: number;
  qiraah: number;
  kitabah: number;
  finalScore: number;
  correctCount: number;
  totalQuestions: number;
  status: string;
  syncedToGoogleSheets: boolean;
}

const PORT = 3000;
const DATA_DIR = path.resolve(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'evaluations.json');
const TEACHER_USERNAME = (process.env.TEACHER_USERNAME || 'guru').trim();
const TEACHER_PASSWORD = process.env.TEACHER_PASSWORD || 'MTs7Arab2026';
const SESSION_SECRET =
  process.env.SESSION_SECRET ||
  crypto.createHash('sha256').update(`hayya-nataallam-${TEACHER_PASSWORD}`).digest('hex');
const COOKIE_NAME = 'hayya_teacher_session';

const SPREADSHEET_HEADERS = [
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
];

function ensureDataStore(): EvaluationRecord[] {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, '[]', 'utf-8');
    return [];
  }
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as EvaluationRecord[]) : [];
  } catch {
    return [];
  }
}

function writeDataStore(records: EvaluationRecord[]): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  const tmpFile = `${DATA_FILE}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(records, null, 2), 'utf-8');
  fs.renameSync(tmpFile, DATA_FILE);
}

function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  if (!cookieHeader) return {};
  const result: Record<string, string> = {};
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = decodeURIComponent(part.slice(idx + 1).trim());
    if (key) result[key] = val;
  }
  return result;
}

function signSessionToken(username: string): string {
  const payload = Buffer.from(
    JSON.stringify({
      role: 'teacher',
      username,
      exp: Date.now() + 1000 * 60 * 60 * 8,
    })
  ).toString('base64url');
  const signature = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(payload)
    .digest('base64url');
  return `${payload}.${signature}`;
}

function verifySessionToken(token: string | undefined): { username: string } | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payload, signature] = parts;
  const expectedSig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(payload)
    .digest('base64url');

  const sigBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }

  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8')) as {
      role?: string;
      username?: string;
      exp?: number;
    };
    if (decoded.role !== 'teacher' || !decoded.username || !decoded.exp) return null;
    if (Date.now() > decoded.exp) return null;
    return { username: decoded.username };
  } catch {
    return null;
  }
}

function requireTeacherAuth(req: Request, res: Response, next: NextFunction): void {
  const cookies = parseCookies(req.headers.cookie);
  const session = verifySessionToken(cookies[COOKIE_NAME]);
  if (!session) {
    res.status(401).json({ ok: false, error: 'Autentikasi guru diperlukan.' });
    return;
  }
  next();
}

function formatWibDateParts(date: Date): { evaluationDate: string; submittedAt: string } {
  const dateFmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const timeFmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jakarta',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  return {
    evaluationDate: dateFmt.format(date),
    submittedAt: `${timeFmt.format(date)} WIB`,
  };
}

function isValidScore(val: unknown): val is number {
  return typeof val === 'number' && Number.isFinite(val) && val >= 0 && val <= 100;
}

function sanitizeText(val: unknown, maxLen = 120): string {
  if (typeof val !== 'string') return '';
  return val.replace(/[\r\n\t]+/g, ' ').trim().slice(0, maxLen);
}

function escapeCsvCell(value: string | number): string {
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  // Student evaluation submission endpoint
  app.post('/api/evaluations', async (req: Request, res: Response) => {
    const body = req.body as Record<string, unknown>;
    const attemptId = sanitizeText(body.attemptId, 100);
    const studentName = sanitizeText(body.studentName, 120);
    const className = sanitizeText(body.className, 40);
    const absentNumber = sanitizeText(body.absentNumber, 20);
    const groupRaw = sanitizeText(body.group, 20);
    const startedAt = sanitizeText(body.startedAt, 60);
    const status = sanitizeText(body.status, 60) || 'Selesai';

    if (!attemptId || !studentName || !className || !absentNumber) {
      res.status(400).json({
        ok: false,
        error: 'Identitas siswa dan ID percobaan evaluasi wajib lengkap.',
      });
      return;
    }

    if (groupRaw !== 'Low' && groupRaw !== 'Middle' && groupRaw !== 'High') {
      res.status(400).json({
        ok: false,
        error: 'Kelompok pembelajaran harus Low, Middle, atau High.',
      });
      return;
    }

    const istima = Number(body.istima);
    const kalam = Number(body.kalam);
    const qiraah = Number(body.qiraah);
    const kitabah = Number(body.kitabah);
    const finalScore = Number(body.finalScore);
    const correctCount = Number(body.correctCount);
    const totalQuestions = Number(body.totalQuestions);

    if (
      !isValidScore(istima) ||
      !isValidScore(kalam) ||
      !isValidScore(qiraah) ||
      !isValidScore(kitabah) ||
      !isValidScore(finalScore) ||
      !Number.isFinite(correctCount) ||
      !Number.isFinite(totalQuestions) ||
      totalQuestions <= 0 ||
      correctCount < 0 ||
      correctCount > totalQuestions
    ) {
      res.status(400).json({
        ok: false,
        error: 'Data nilai evaluasi tidak valid atau belum lengkap.',
      });
      return;
    }

    const existing = ensureDataStore();
    const duplicate = existing.find((item) => item.attemptId === attemptId);
    if (duplicate) {
      res.status(200).json({
        ok: true,
        duplicatePrevented: true,
        syncedToGoogleSheets: duplicate.syncedToGoogleSheets,
        record: duplicate,
      });
      return;
    }

    const now = new Date();
    const { evaluationDate, submittedAt } = formatWibDateParts(now);
    const rowNumber = existing.length + 1;

    const newRecord: EvaluationRecord = {
      id: crypto.randomUUID(),
      rowNumber,
      attemptId,
      studentName,
      className,
      absentNumber,
      group: groupRaw,
      startedAt: startedAt || now.toISOString(),
      evaluationDate,
      submittedAt,
      istima: Math.round(istima * 100) / 100,
      kalam: Math.round(kalam * 100) / 100,
      qiraah: Math.round(qiraah * 100) / 100,
      kitabah: Math.round(kitabah * 100) / 100,
      finalScore: Math.round(finalScore * 100) / 100,
      correctCount: Math.round(correctCount),
      totalQuestions: Math.round(totalQuestions),
      status,
      syncedToGoogleSheets: false,
    };

    const webhookUrl = (process.env.APPS_SCRIPT_WEBHOOK_URL || '').trim();
    if (webhookUrl) {
      try {
        if (!webhookUrl.startsWith('https://')) {
          throw new Error('Webhook Google Apps Script wajib menggunakan HTTPS.');
        }
        const gsResponse = await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sheetName: 'DATA NILAI SISWA',
            record: newRecord,
          }),
        });
        if (!gsResponse.ok) {
          throw new Error(`HTTP ${gsResponse.status}`);
        }
        const gsResult = (await gsResponse.json().catch(() => ({}))) as { ok?: boolean };
        if (gsResult.ok === false) {
          throw new Error('Apps Script menolak penyimpanan.');
        }
        newRecord.syncedToGoogleSheets = true;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Koneksi gagal';
        res.status(502).json({
          ok: false,
          error: `Gagal menyimpan nilai ke Google Spreadsheet (${message}).`,
        });
        return;
      }
    }

    existing.push(newRecord);
    writeDataStore(existing);

    res.status(201).json({
      ok: true,
      syncedToGoogleSheets: newRecord.syncedToGoogleSheets,
      record: newRecord,
    });
  });

  // Teacher authentication endpoints (completely separate from student identity)
  app.post('/api/teacher/login', (req: Request, res: Response) => {
    const body = req.body as { username?: unknown; password?: unknown };
    const username = sanitizeText(body.username, 60);
    const password = typeof body.password === 'string' ? body.password : '';

    const expectedPassBuf = Buffer.from(TEACHER_PASSWORD);
    const givenPassBuf = Buffer.from(password);
    const passMatches =
      expectedPassBuf.length === givenPassBuf.length &&
      crypto.timingSafeEqual(expectedPassBuf, givenPassBuf);

    if (username !== TEACHER_USERNAME || !passMatches) {
      res.status(401).json({
        ok: false,
        error: 'Username atau kata sandi guru tidak sesuai.',
      });
      return;
    }

    const token = signSessionToken(username);
    res.setHeader(
      'Set-Cookie',
      `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 8}`
    );
    res.json({ ok: true, teacherName: username });
  });

  app.get('/api/teacher/session', (req: Request, res: Response) => {
    const cookies = parseCookies(req.headers.cookie);
    const session = verifySessionToken(cookies[COOKIE_NAME]);
    if (!session) {
      res.json({ authenticated: false });
      return;
    }
    res.json({ authenticated: true, teacherName: session.username });
  });

  app.post('/api/teacher/logout', (_req: Request, res: Response) => {
    res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
    res.json({ ok: true });
  });

  app.get('/api/teacher/evaluations', requireTeacherAuth, async (_req: Request, res: Response) => {
    const localRecords = ensureDataStore();
    const webhookUrl = (process.env.APPS_SCRIPT_WEBHOOK_URL || '').trim();
    let records = localRecords;

    if (webhookUrl && webhookUrl.startsWith('https://')) {
      try {
        const gsRes = await fetch(`${webhookUrl}?sheet=DATA%20NILAI%20SISWA`, {
          method: 'GET',
        });
        if (gsRes.ok) {
          const data = (await gsRes.json()) as { ok?: boolean; records?: EvaluationRecord[] };
          if (data.ok && Array.isArray(data.records) && data.records.length > 0) {
            records = data.records;
          }
        }
      } catch {
        // Fallback to server-persisted records if read proxy times out
      }
    }

    res.json({
      ok: true,
      appsScriptConnected: Boolean(webhookUrl && webhookUrl.startsWith('https://')),
      evaluations: records,
    });
  });

  app.get('/api/teacher/export', requireTeacherAuth, (req: Request, res: Response) => {
    const groupFilter = sanitizeText(req.query.group, 20);
    const classFilter = sanitizeText(req.query.className, 40);

    let records = ensureDataStore();
    if (groupFilter && groupFilter !== 'Semua') {
      records = records.filter((r) => r.group === groupFilter);
    }
    if (classFilter && classFilter !== 'Semua') {
      records = records.filter((r) => r.className === classFilter);
    }

    const rows = records.map((r, idx) => [
      idx + 1,
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

    const csvLines = [
      SPREADSHEET_HEADERS.map(escapeCsvCell).join(','),
      ...rows.map((row) => row.map(escapeCsvCell).join(',')),
    ];

    const csvWithBom = `\uFEFF${csvLines.join('\r\n')}`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="DATA_NILAI_SISWA_ELKPD.csv"');
    res.send(csvWithBom);
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
