/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import { AboutSection } from './components/AboutSection';
import { ElkbdViewer } from './components/ElkbdViewer';
import { Footer } from './components/Footer';
import { GuideSection } from './components/GuideSection';
import { HeroSection } from './components/HeroSection';
import { LevelCardsSection } from './components/LevelCardsSection';
import { Navbar } from './components/Navbar';
import { TeacherDashboard } from './components/TeacherDashboard';
import type { LearningLevel } from './data/portalData';
import type { LearningGroup, StudentSession } from './types/evaluation';

const SESSION_STORAGE_KEY = 'hayya_student_session';

function mapLevelIdToGroup(id: LearningLevel['id']): LearningGroup {
  if (id === 'low') return 'Low';
  if (id === 'middle') return 'Middle';
  return 'High';
}

function loadSavedSession(): StudentSession | null {
  try {
    const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StudentSession>;
    if (!parsed.studentName || !parsed.className || !parsed.absentNumber) return null;
    return parsed as StudentSession;
  } catch {
    return null;
  }
}

export default function App() {
  const [studentSession, setStudentSession] = useState<StudentSession | null>(loadSavedSession);
  const [activeLevel, setActiveLevel] = useState<LearningLevel | null>(null);
  const [viewMode, setViewMode] = useState<'portal' | 'teacher'>('portal');

  useEffect(() => {
    try {
      if (studentSession) {
        sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(studentSession));
      } else {
        sessionStorage.removeItem(SESSION_STORAGE_KEY);
      }
    } catch {
      // Ignore storage restrictions
    }
  }, [studentSession]);

  const scrollToSection = (sectionId: string) => {
    setViewMode('portal');
    requestAnimationFrame(() => {
      const element = document.getElementById(sectionId);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  };

  const handleSelectLevel = (level: LearningLevel) => {
    if (!studentSession) {
      scrollToSection('pilih-tingkat');
      return;
    }

    const updatedSession: StudentSession = {
      ...studentSession,
      activeGroup: mapLevelIdToGroup(level.id),
      attemptId: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
      startedAt: new Date().toISOString(),
    };
    setStudentSession(updatedSession);
    setActiveLevel(level);
  };

  if (viewMode === 'teacher') {
    return (
      <TeacherDashboard
        onBackToPortal={() => {
          setViewMode('portal');
          setActiveLevel(null);
        }}
      />
    );
  }

  if (activeLevel && studentSession) {
    return (
      <ElkbdViewer
        activeLevel={activeLevel}
        studentSession={studentSession}
        onBackHome={() => setActiveLevel(null)}
        onSwitchLevel={(level) => handleSelectLevel(level)}
      />
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      <Navbar
        onNavigateSection={scrollToSection}
        onOpenTeacherDashboard={() => {
          setActiveLevel(null);
          setViewMode('teacher');
        }}
      />
      <main className="flex-1">
        <HeroSection
          onStartLearning={() => scrollToSection('pilih-tingkat')}
          onOpenGuide={() => scrollToSection('panduan')}
        />
        <LevelCardsSection
          studentSession={studentSession}
          onLoginStudent={(session) => setStudentSession(session)}
          onResetStudent={() => setStudentSession(null)}
          onSelectLevel={handleSelectLevel}
        />
        <GuideSection />
        <AboutSection />
      </main>
      <Footer
        onNavigateSection={scrollToSection}
        onSelectLevel={handleSelectLevel}
        onOpenTeacherDashboard={() => {
          setActiveLevel(null);
          setViewMode('teacher');
        }}
      />
    </div>
  );
}
