import { useCallback, useEffect, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { AdminDashboard } from './components/AdminDashboard.tsx';
import { AnalysisInput } from './components/AnalysisInput.tsx';
import { AnalysisProgress } from './components/AnalysisProgress.tsx';
import { ApiDocsView } from './components/ApiDocsView.tsx';
import { AuthModal } from './components/AuthModal.tsx';
import { HistoryTable } from './components/HistoryTable.tsx';
import { LandingHero } from './components/LandingHero.tsx';
import { ActiveView, Navbar } from './components/Navbar.tsx';
import { ReportViewer } from './components/ReportViewer.tsx';
import { Sidebar } from './components/Sidebar.tsx';
import { SystemHealthView } from './components/SystemHealthView.tsx';
import {
  auth,
  deleteAnalysisFromFirestore,
  onAuthStateChanged,
  saveAnalysisToFirestore,
  signOut,
  subscribeUserAnalyses,
  syncUserProfileToFirestore,
  User,
} from './lib/firebase.ts';
import {
  AnalysisPipelineStage,
  AnalysisResult,
  SystemHealthStatus,
} from './types/analysis.ts';

export default function App() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [activeView, setActiveView] = useState<ActiveView>('landing');
  const [analyzerTab, setAnalyzerTab] = useState<'url' | 'image'>('url');

  // Auth states (Firebase + modular JWT)
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [jwtSession, setJwtSession] = useState<{
    email: string;
    token: string;
    userId: string;
  } | null>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  // Analysis pipeline & active report state
  const [pipelineStage, setPipelineStage] = useState<AnalysisPipelineStage>('idle');
  const [activeTargetLabel, setActiveTargetLabel] = useState('');
  const [currentResult, setCurrentResult] = useState<AnalysisResult | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  // History & System Health
  const [apiHistory, setApiHistory] = useState<AnalysisResult[]>([]);
  const [firestoreHistory, setFirestoreHistory] = useState<AnalysisResult[]>([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [systemHealth, setSystemHealth] = useState<SystemHealthStatus | null>(null);

  // Sync dark mode class on <html>
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [theme]);

  // Listen to Firebase Auth state
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setFirebaseUser(u);
      if (u && u.emailVerified) {
        try {
          await syncUserProfileToFirestore(u);
        } catch {
          // Non-blocking profile sync
        }
      }
    });
    return () => unsub();
  }, []);

  // Subscribe to Firestore user analyses when signed in with Firebase
  useEffect(() => {
    if (!firebaseUser || !firebaseUser.emailVerified) {
      setFirestoreHistory([]);
      return;
    }
    const unsub = subscribeUserAnalyses(firebaseUser.uid, (records) => {
      setFirestoreHistory(records);
    });
    return () => unsub();
  }, [firebaseUser]);

  const fetchBackendHistoryAndHealth = useCallback(async () => {
    setIsHistoryLoading(true);
    try {
      const [histRes, healthRes] = await Promise.all([
        fetch('/api/history'),
        fetch('/api/health'),
      ]);
      if (histRes.ok) {
        const data = await histRes.json();
        setApiHistory(Array.isArray(data.items) ? data.items : []);
      }
      if (healthRes.ok) {
        const hData = await healthRes.json();
        setSystemHealth(hData);
      }
    } catch {
      // Non-fatal initial fetch error
    } finally {
      setIsHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBackendHistoryAndHealth();
  }, [fetchBackendHistoryAndHealth]);

  // Merge Firestore and Backend History without duplicates
  const combinedHistory = (() => {
    const map = new Map<string, AnalysisResult>();
    for (const item of apiHistory) {
      map.set(item.id, item);
    }
    for (const item of firestoreHistory) {
      if (!map.has(item.id)) {
        map.set(item.id, item);
      }
    }
    return Array.from(map.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  })();

  const activeUserEmail = firebaseUser?.email || jwtSession?.email || null;
  const activeUserId = firebaseUser?.uid || jwtSession?.userId || 'anonymous';

  const handleSignOut = async () => {
    if (firebaseUser) {
      await signOut(auth);
    }
    setJwtSession(null);
  };

  // URL Analysis Handler
  const handleAnalyzeUrl = async (url: string, isDemo: boolean, demoPreset?: string) => {
    setAnalysisError(null);
    setCurrentResult(null);
    setActiveView('analyzer');
    setAnalyzerTab('url');
    setActiveTargetLabel(url);
    setPipelineStage('validating');

    const stageTimer1 = setTimeout(() => setPipelineStage('extracting'), 280);
    const stageTimer2 = setTimeout(() => setPipelineStage('analyzing'), 650);
    const stageTimer3 = setTimeout(() => setPipelineStage('processing'), 1100);

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (jwtSession?.token) {
        headers.Authorization = `Bearer ${jwtSession.token}`;
      } else if (firebaseUser) {
        const idToken = await firebaseUser.getIdToken();
        headers.Authorization = `Bearer ${idToken}`;
      }

      const res = await fetch('/api/analyze/url', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          url,
          isDemo,
          demoPreset,
          userId: activeUserId,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to analyze the submitted URL.');
      }

      const result = data as AnalysisResult;
      setPipelineStage('completed');
      setCurrentResult(result);

      if (firebaseUser && firebaseUser.emailVerified) {
        try {
          await saveAnalysisToFirestore(result);
        } catch {
          // Already stored on backend; non-blocking
        }
      }

      await fetchBackendHistoryAndHealth();
    } catch (err) {
      setPipelineStage('failed');
      setAnalysisError(
        err instanceof Error
          ? err.message
          : 'Unable to complete URL analysis. Please check the URL and try again.'
      );
    } finally {
      clearTimeout(stageTimer1);
      clearTimeout(stageTimer2);
      clearTimeout(stageTimer3);
    }
  };

  // Image Analysis Handler
  const handleAnalyzeImage = async (payload: {
    imageBase64?: string;
    filename: string;
    mimeType: string;
    isDemo: boolean;
    demoPresetKey?: 'synthetic-summit' | 'authentic-buoy';
  }) => {
    setAnalysisError(null);
    setCurrentResult(null);
    setActiveView('analyzer');
    setAnalyzerTab('image');
    setActiveTargetLabel(payload.filename);
    setPipelineStage('validating');

    const stageTimer1 = setTimeout(() => setPipelineStage('extracting'), 240);
    const stageTimer2 = setTimeout(() => setPipelineStage('analyzing'), 550);
    const stageTimer3 = setTimeout(() => setPipelineStage('processing'), 950);

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (jwtSession?.token) {
        headers.Authorization = `Bearer ${jwtSession.token}`;
      } else if (firebaseUser) {
        const idToken = await firebaseUser.getIdToken();
        headers.Authorization = `Bearer ${idToken}`;
      }

      const res = await fetch('/api/analyze/image', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          ...payload,
          userId: activeUserId,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to analyze the uploaded image.');
      }

      const result = data as AnalysisResult;
      setPipelineStage('completed');
      setCurrentResult(result);

      if (firebaseUser && firebaseUser.emailVerified) {
        try {
          await saveAnalysisToFirestore(result);
        } catch {
          // Non-blocking
        }
      }

      await fetchBackendHistoryAndHealth();
    } catch (err) {
      setPipelineStage('failed');
      setAnalysisError(
        err instanceof Error
          ? err.message
          : 'Unable to complete image analysis. Please verify the file and try again.'
      );
    } finally {
      clearTimeout(stageTimer1);
      clearTimeout(stageTimer2);
      clearTimeout(stageTimer3);
    }
  };

  const handleDeleteRecord = async (id: string) => {
    try {
      await fetch(`/api/history/${id}`, { method: 'DELETE' });
      if (firebaseUser && firebaseUser.emailVerified) {
        try {
          await deleteAnalysisFromFirestore(id);
        } catch {
          // Ignore if record only existed in local adapter
        }
      }
      setApiHistory((prev) => prev.filter((item) => item.id !== id));
      setFirestoreHistory((prev) => prev.filter((item) => item.id !== id));
      if (currentResult?.id === id) {
        setCurrentResult(null);
        setPipelineStage('idle');
      }
      await fetchBackendHistoryAndHealth();
    } catch {
      // Non-fatal delete error
    }
  };

  const isAnalyzing =
    pipelineStage === 'validating' ||
    pipelineStage === 'extracting' ||
    pipelineStage === 'analyzing' ||
    pipelineStage === 'processing';

  return (
    <div id="top" className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      {/* 3-Zone Top Bar Contract */}
      <Navbar
        activeView={activeView}
        onNavigate={(view) => {
          setActiveView(view);
          setAnalysisError(null);
        }}
        userEmail={activeUserEmail}
        onOpenAuth={() => setIsAuthModalOpen(true)}
        onSignOut={handleSignOut}
      />

      {/* Workspace Canvas: Sidebar + Main Viewport */}
      <div className="flex-1 flex flex-col lg:flex-row max-w-[1440px] w-full mx-auto">
        <Sidebar
          activeView={activeView}
          onNavigate={(view) => {
            setActiveView(view);
            setAnalysisError(null);
          }}
          theme={theme}
          onToggleTheme={() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
          totalAnalysesCount={combinedHistory.length}
          userEmail={activeUserEmail}
        />

        <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8 space-y-6">
          {activeView === 'landing' && (
            <LandingHero
              onStartUrlAnalysis={() => {
                setAnalyzerTab('url');
                setCurrentResult(null);
                setPipelineStage('idle');
                setActiveView('analyzer');
              }}
              onStartImageAnalysis={() => {
                setAnalyzerTab('image');
                setCurrentResult(null);
                setPipelineStage('idle');
                setActiveView('analyzer');
              }}
              onRunQuickDemo={() => {
                handleAnalyzeUrl(
                  'https://global-truth-wire-daily.net/breaking/2026-secret-grid-shutdown-exposed',
                  false,
                  'suspicious-claim'
                );
              }}
            />
          )}

          {activeView === 'analyzer' && (
            <div className="space-y-6">
              <AnalysisInput
                activeTab={analyzerTab}
                onTabChange={(tab) => {
                  setAnalyzerTab(tab);
                  setAnalysisError(null);
                }}
                onAnalyzeUrl={handleAnalyzeUrl}
                onAnalyzeImage={handleAnalyzeImage}
                isLoading={isAnalyzing}
              />

              {isAnalyzing && (
                <AnalysisProgress
                  stage={pipelineStage}
                  analysisType={analyzerTab}
                  targetLabel={activeTargetLabel}
                />
              )}

              {analysisError && (
                <div
                  role="alert"
                  className="rounded-xl border border-red-500/40 bg-red-500/10 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-red-900 dark:text-red-200">
                        Analysis Could Not Be Completed
                      </p>
                      <p className="text-xs text-red-800 dark:text-red-300">
                        {analysisError}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      if (analyzerTab === 'url') {
                        handleAnalyzeUrl(
                          'https://global-truth-wire-daily.net/breaking/2026-secret-grid-shutdown-exposed',
                          true,
                          'suspicious-claim'
                        );
                      } else {
                        handleAnalyzeImage({
                          filename: 'climate_summit_podium_press.jpg',
                          mimeType: 'image/jpeg',
                          isDemo: true,
                          demoPresetKey: 'synthetic-summit',
                        });
                      }
                    }}
                    className="px-4 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-500 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Load Demo Assessment Instead
                  </button>
                </div>
              )}

              {currentResult && !isAnalyzing && (
                <ReportViewer
                  result={currentResult}
                  onAnalyzeAnother={() => {
                    setCurrentResult(null);
                    setPipelineStage('idle');
                    setAnalysisError(null);
                  }}
                />
              )}
            </div>
          )}

          {activeView === 'history' && (
            <HistoryTable
              records={combinedHistory}
              isLoading={isHistoryLoading}
              onSelectRecord={(rec) => {
                setCurrentResult(rec);
                setPipelineStage('completed');
                setActiveView('analyzer');
              }}
              onDeleteRecord={handleDeleteRecord}
              onStartNewAnalysis={() => {
                setCurrentResult(null);
                setPipelineStage('idle');
                setActiveView('analyzer');
              }}
            />
          )}

          {activeView === 'admin' && (
            <AdminDashboard
              health={systemHealth}
              onRefresh={fetchBackendHistoryAndHealth}
            />
          )}

          {activeView === 'health' && (
            <SystemHealthView
              health={systemHealth}
              onRefresh={fetchBackendHistoryAndHealth}
            />
          )}

          {activeView === 'docs' && <ApiDocsView />}
        </main>
      </div>

      {/* Quiet Footer */}
      <footer className="border-t border-slate-200 dark:border-slate-800/90 bg-white dark:bg-slate-950 px-6 py-4">
        <div className="max-w-[1440px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500 dark:text-slate-400">
          <p>
            TruthLens AI — Multimodal Content Authenticity Analyzer. Assessments are probabilistic indicators, not definitive proof.
          </p>
          <div className="flex items-center gap-5">
            <button
              type="button"
              onClick={() => setActiveView('analyzer')}
              className="hover:text-slate-900 dark:hover:text-slate-200 cursor-pointer"
            >
              Analyzer
            </button>
            <button
              type="button"
              onClick={() => setActiveView('history')}
              className="hover:text-slate-900 dark:hover:text-slate-200 cursor-pointer"
            >
              History
            </button>
            <button
              type="button"
              onClick={() => setActiveView('health')}
              className="hover:text-slate-900 dark:hover:text-slate-200 cursor-pointer"
            >
              System Health
            </button>
            <button
              type="button"
              onClick={() => setActiveView('docs')}
              className="hover:text-slate-900 dark:hover:text-slate-200 cursor-pointer"
            >
              API Docs
            </button>
          </div>
        </div>
      </footer>

      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        onJwtSuccess={(email, token, userId) => {
          setJwtSession({ email, token, userId });
        }}
      />
    </div>
  );
}
