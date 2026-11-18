import { AlertCircle, ArrowRight, UserCheck } from 'lucide-react';
import { motion } from 'motion/react';
import { useState, type FormEvent } from 'react';
import type { StudentSession } from '../types/evaluation';

interface StudentLoginCardProps {
  onLoginSuccess: (session: StudentSession) => void;
}

const CLASS_OPTIONS = [
  'VII-A',
  'VII-B',
  'VII-C',
  'VII-D',
  'VII-E',
  'VII-F',
  'VII-G',
  'VII-H',
  'Lainnya',
];

export function StudentLoginCard({ onLoginSuccess }: StudentLoginCardProps) {
  const [studentName, setStudentName] = useState('');
  const [selectedClass, setSelectedClass] = useState('');
  const [customClass, setCustomClass] = useState('');
  const [absentNumber, setAbsentNumber] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();

    const trimmedName = studentName.trim();
    const resolvedClass = selectedClass === 'Lainnya' ? customClass.trim() : selectedClass.trim();
    const trimmedAbsent = absentNumber.trim();

    const missingFields: string[] = [];
    if (!trimmedName) missingFields.push('Nama lengkap siswa wajib diisi');
    if (!resolvedClass) missingFields.push('Kelas wajib dipilih');
    if (!trimmedAbsent) missingFields.push('Nomor absen wajib diisi');

    if (missingFields.length > 0) {
      setErrorMessage(`Data belum lengkap: ${missingFields.join(', ')}.`);
      return;
    }

    setErrorMessage(null);
    onLoginSuccess({
      studentName: trimmedName,
      className: resolvedClass,
      absentNumber: trimmedAbsent,
      loggedInAt: new Date().toISOString(),
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="mx-auto mt-10 max-w-2xl rounded-3xl border border-teal-200/80 bg-white p-6 shadow-sm sm:p-10"
    >
      <div className="text-center space-y-2.5">
        <p
          dir="rtl"
          lang="ar"
          className="font-arabic-hero text-3xl sm:text-4xl font-bold text-teal-800"
        >
          مَرْحَبًا بِكَ فِي التَّعَلُّمِ!
        </p>
        <h3 className="font-display text-xl sm:text-2xl font-bold text-slate-900">
          Identitas Siswa Sebelum Belajar
        </h3>
        <p className="mx-auto max-w-lg text-sm sm:text-base leading-relaxed text-slate-600">
          Selamat datang di E-LKPD Bahasa Arab kelas VII. Silakan masukkan identitasmu sebelum
          memulai pembelajaran.
        </p>
      </div>

      <form onSubmit={handleSubmit} noValidate className="mt-8 space-y-5">
        {errorMessage && (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" aria-hidden="true" />
            <span>{errorMessage}</span>
          </div>
        )}

        <div>
          <label
            htmlFor="student-name"
            className="block text-sm font-semibold text-slate-800 mb-1.5"
          >
            Nama Lengkap Siswa <span className="text-rose-600">*</span>
          </label>
          <input
            id="student-name"
            type="text"
            value={studentName}
            onChange={(e) => setStudentName(e.target.value)}
            placeholder="Contoh: Ahmad Fauzan"
            autoComplete="name"
            className="w-full rounded-xl border border-slate-300 bg-slate-50/60 px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 transition-colors focus:border-teal-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-600/20 min-h-[44px]"
          />
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div>
            <label
              htmlFor="student-class"
              className="block text-sm font-semibold text-slate-800 mb-1.5"
            >
              Kelas <span className="text-rose-600">*</span>
            </label>
            <select
              id="student-class"
              value={selectedClass}
              onChange={(e) => setSelectedClass(e.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-slate-50/60 px-4 py-3 text-sm text-slate-900 transition-colors focus:border-teal-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-600/20 min-h-[44px]"
            >
              <option value="">Pilih kelas...</option>
              {CLASS_OPTIONS.map((cls) => (
                <option key={cls} value={cls}>
                  {cls}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="student-absent"
              className="block text-sm font-semibold text-slate-800 mb-1.5"
            >
              Nomor Absen <span className="text-rose-600">*</span>
            </label>
            <input
              id="student-absent"
              type="number"
              min={1}
              max={60}
              value={absentNumber}
              onChange={(e) => setAbsentNumber(e.target.value)}
              placeholder="Contoh: 05"
              className="w-full rounded-xl border border-slate-300 bg-slate-50/60 px-4 py-3 text-sm tabular-nums text-slate-900 placeholder:text-slate-400 transition-colors focus:border-teal-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-600/20 min-h-[44px]"
            />
          </div>
        </div>

        {selectedClass === 'Lainnya' && (
          <div>
            <label
              htmlFor="student-custom-class"
              className="block text-sm font-semibold text-slate-800 mb-1.5"
            >
              Tulis Nama Kelas <span className="text-rose-600">*</span>
            </label>
            <input
              id="student-custom-class"
              type="text"
              value={customClass}
              onChange={(e) => setCustomClass(e.target.value)}
              placeholder="Contoh: VII Unggulan"
              className="w-full rounded-xl border border-slate-300 bg-slate-50/60 px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 transition-colors focus:border-teal-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-600/20 min-h-[44px]"
            />
          </div>
        )}

        <div className="pt-2">
          <button
            type="submit"
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-teal-700 px-6 py-3.5 text-sm font-semibold text-white shadow-sm shadow-teal-900/15 transition-all duration-150 hover:bg-teal-800 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 min-h-[48px]"
          >
            <UserCheck className="h-4 w-4" aria-hidden="true" />
            <span>MASUK DAN MULAI BELAJAR</span>
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </form>
    </motion.div>
  );
}
