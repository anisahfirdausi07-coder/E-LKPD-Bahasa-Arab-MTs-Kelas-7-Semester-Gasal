import { ArrowRight, BookOpen, LogOut, User } from 'lucide-react';
import { motion } from 'motion/react';
import { useState } from 'react';
import { LEARNING_LEVELS, type LearningLevel } from '../data/portalData';
import type { StudentSession } from '../types/evaluation';
import { StudentLoginCard } from './StudentLoginCard';

interface LevelCardsSectionProps {
  studentSession: StudentSession | null;
  onLoginStudent: (session: StudentSession) => void;
  onResetStudent: () => void;
  onSelectLevel: (level: LearningLevel) => void;
}

export function LevelCardsSection({
  studentSession,
  onLoginStudent,
  onResetStudent,
  onSelectLevel,
}: LevelCardsSectionProps) {
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});

  const markImageFailed = (id: string) => {
    setFailedImages((prev) => ({ ...prev, [id]: true }));
  };

  return (
    <section id="pilih-tingkat" className="bg-slate-50 py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center space-y-2.5">
          <p
            dir="rtl"
            lang="ar"
            className="font-arabic text-2xl sm:text-3xl font-bold text-teal-800"
          >
            اخْتَرْ مُسْتَوَى التَّعَلُّمِ
          </p>
          <h2 className="font-display text-2xl sm:text-4xl font-bold tracking-tight text-slate-900 text-balance">
            Pilihan Tingkat Pembelajaran
          </h2>
          <p className="text-base text-slate-600">
            {studentSession
              ? 'Pilih salah satu kelompok belajar di bawah ini untuk membuka E-LKPD Bahasa Arab sesuai tingkat kesiapan belajarmu.'
              : 'Lengkapi identitas siswa terlebih dahulu untuk membuka akses ke kelompok belajar Low, Middle, atau High.'}
          </p>
        </div>

        {!studentSession ? (
          <StudentLoginCard onLoginSuccess={onLoginStudent} />
        ) : (
          <div className="mt-10 space-y-8">
            {/* Active Student Session Greeting */}
            <div className="mx-auto flex max-w-4xl flex-col gap-3 rounded-2xl border border-teal-200 bg-white px-5 py-4 shadow-xs sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
                  <User className="h-5 w-5" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <p className="font-display text-base sm:text-lg font-bold text-slate-900 truncate">
                    Selamat belajar, {studentSession.studentName}!
                  </p>
                  <p className="text-xs sm:text-sm text-slate-600">
                    Kelas {studentSession.className} <span aria-hidden="true">·</span> No. Absen{' '}
                    <span className="tabular-nums">{studentSession.absentNumber}</span>
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={onResetStudent}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-semibold text-slate-700 whitespace-nowrap shrink-0 transition-colors hover:border-slate-300 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 min-h-[40px]"
              >
                <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Ganti Identitas</span>
              </button>
            </div>

            {/* 3 Learning Group Cards */}
            <div className="grid grid-cols-1 gap-7 lg:grid-cols-3">
              {LEARNING_LEVELS.map((level, index) => (
                <motion.article
                  key={level.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: index * 0.08, ease: [0.16, 1, 0.3, 1] }}
                  className={`group flex flex-col rounded-2xl border ${level.cardBorderClass} ${level.cardBgClass} p-5 shadow-sm transition-all duration-200 hover:-translate-y-1.5 hover:shadow-md`}
                >
                  <div className="overflow-hidden rounded-xl bg-white/80 aspect-[4/3]">
                    {!failedImages[level.id] ? (
                      <img
                        src={level.image}
                        alt={level.imageAlt}
                        referrerPolicy="no-referrer"
                        onError={() => markImageFailed(level.id)}
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                      />
                    ) : (
                      <div className="flex h-full w-full flex-col items-center justify-center p-6 text-center">
                        <BookOpen className={`h-10 w-10 ${level.titleColorClass} mb-2`} />
                        <span className={`font-display text-lg font-bold ${level.titleColorClass}`}>
                          {level.name}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="mt-5 flex flex-1 flex-col justify-between space-y-5">
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between gap-2 text-xs font-semibold text-slate-600">
                        <span>
                          {level.groupLabel} <span aria-hidden="true">·</span> {level.tierLabel}
                        </span>
                        <span
                          dir="rtl"
                          lang="ar"
                          className={`font-arabic text-sm ${level.titleColorClass}`}
                        >
                          {level.arabicName}
                        </span>
                      </div>

                      <h3
                        className={`font-display text-2xl font-bold tracking-tight ${level.titleColorClass}`}
                      >
                        {level.name}
                      </h3>

                      <p className="text-[15px] leading-relaxed text-slate-700">
                        {level.description}
                      </p>
                    </div>

                    <div className="pt-1">
                      <button
                        type="button"
                        onClick={() => onSelectLevel(level)}
                        className={`flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold whitespace-nowrap transition-all duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 min-h-[44px] ${level.buttonClass} ${level.focusRingClass}`}
                      >
                        <span>{level.buttonLabel}</span>
                        <ArrowRight
                          className="h-4 w-4 transition-transform duration-150 group-hover:translate-x-0.5"
                          aria-hidden="true"
                        />
                      </button>
                    </div>
                  </div>
                </motion.article>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
