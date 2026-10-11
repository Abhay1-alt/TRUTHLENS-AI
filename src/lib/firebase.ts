import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  User,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  getFirestore,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { AnalysisResult, Signal } from '../types/analysis.ts';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Validate Connection to Firestore on boot (Mandatory per firebase-integration-rpc skill)
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
testConnection();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Verbatim constants synchronized with firebase-blueprint.json & firestore.rules
export const BLUEPRINT_CONSTRAINTS = {
  ID_PATTERN: /^[a-zA-Z0-9_-]+$/,
  MAX_ID_LENGTH: 128,
  MAX_DISPLAY_NAME_LENGTH: 100,
  MAX_EMAIL_LENGTH: 254,
  MAX_INPUT_REF_LENGTH: 1024,
  MAX_SUMMARY_LENGTH: 3000,
  MAX_EVIDENCE_SUMMARY_LENGTH: 4000,
  MAX_METADATA_SUMMARY_LENGTH: 4000,
  MAX_EXPLANATION_LENGTH: 2000,
  MAX_SIGNAL_DESC_LENGTH: 1000,
  MAX_SIGNAL_EVIDENCE_LENGTH: 1000,
  MAX_SIGNALS_LIST: 20,
  MAX_RECOMMENDATIONS_LIST: 10,
};

function sanitizeId(rawId: string): string {
  const cleaned = rawId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, BLUEPRINT_CONSTRAINTS.MAX_ID_LENGTH);
  return cleaned || `id_${Date.now()}`;
}

function clampInt(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(Number(val) || 0)));
}

/**
 * Ensures the signed-in user's public profile (/users/{uid}) and isolated PII document
 * (/users/{uid}/private/info) exist in Firestore following Pillar 6 (PII Isolation).
 */
export async function syncUserProfileToFirestore(user: User): Promise<void> {
  if (!user.emailVerified) return;
  const uid = sanitizeId(user.uid);
  const userPath = `users/${uid}`;
  const privatePath = `users/${uid}/private/info`;

  try {
    const existingDoc = await getDoc(doc(db, 'users', uid));
    if (!existingDoc.exists()) {
      const batch = writeBatch(db);
      batch.set(doc(db, 'users', uid), {
        uid,
        displayName: (user.displayName || user.email?.split('@')[0] || 'Analyst').slice(
          0,
          BLUEPRINT_CONSTRAINTS.MAX_DISPLAY_NAME_LENGTH
        ),
        createdAt: serverTimestamp(),
      });
      if (user.email) {
        batch.set(doc(db, 'users', uid, 'private', 'info'), {
          uid,
          email: user.email.slice(0, BLUEPRINT_CONSTRAINTS.MAX_EMAIL_LENGTH),
          createdAt: serverTimestamp(),
        });
      }
      await batch.commit();
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `${userPath} & ${privatePath}`);
  }
}

/**
 * Persists a completed AnalysisResult and its subcollection signals to Firestore
 * with strict adherence to firebase-blueprint.json and firestore.rules.
 */
export async function saveAnalysisToFirestore(result: AnalysisResult): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser || !currentUser.emailVerified) {
    return;
  }

  const uid = sanitizeId(currentUser.uid);
  const analysisId = sanitizeId(result.id);
  const analysisPath = `analyses/${analysisId}`;

  const evidenceSummaryText =
    result.analysisType === 'url' && result.urlData
      ? `Domain: ${result.urlData.domain} | Author: ${result.urlData.author} | Published: ${result.urlData.publishedDate} | Snippets: ${result.urlData.textSnippets.join(' // ') || 'None'}`
      : result.imageMetadata
        ? `File: ${result.imageMetadata.filename} (${result.imageMetadata.width}x${result.imageMetadata.height}, ${result.imageMetadata.fileSizeFormatted}) | SHA256: ${result.imageMetadata.sha256Hash.slice(0, 24)}...`
        : 'Observed technical and contextual evidence.';

  const metadataSummaryText =
    result.analysisType === 'url' && result.urlData
      ? `HTTPS: ${result.urlData.isHttps ? 'Yes' : 'No'} | Schema.org: ${result.urlData.schemaOrgTypes.join(', ') || 'None'} | OpenGraph keys: ${Object.keys(result.urlData.openGraph).length}`
      : result.imageMetadata
        ? `Format: ${result.imageMetadata.extension} | Color: ${result.imageMetadata.colorMode} | EXIF: ${result.imageMetadata.exif.hasExif ? 'Present' : 'Absent'} | Camera: ${result.imageMetadata.exif.cameraMakeModel || 'Unavailable'}`
        : 'Metadata inspected.';

  const signalsSummary = result.signals
    .slice(0, BLUEPRINT_CONSTRAINTS.MAX_SIGNALS_LIST)
    .map((s) => `[${s.severity.toUpperCase()}] ${s.category}: ${s.description}`.slice(0, 480));

  const recommendations = result.recommendations
    .slice(0, BLUEPRINT_CONSTRAINTS.MAX_RECOMMENDATIONS_LIST)
    .map((r) => String(r).slice(0, 480));

  const payload = {
    userId: uid,
    analysisType: result.analysisType,
    inputReference: (result.inputReference || 'unknown').slice(
      0,
      BLUEPRINT_CONSTRAINTS.MAX_INPUT_REF_LENGTH
    ),
    classification: result.classification,
    confidence: Math.max(0, Math.min(1, Number(result.confidence) || 0.5)),
    riskScore: clampInt(result.riskScore, 0, 100),
    summary: (result.summary || 'Analysis completed.').slice(
      0,
      BLUEPRINT_CONSTRAINTS.MAX_SUMMARY_LENGTH
    ),
    isDemo: Boolean(result.isDemo),
    sourceScore: clampInt(result.breakdown.source, 0, 100),
    contentScore: clampInt(result.breakdown.content, 0, 100),
    metadataScore: clampInt(result.breakdown.metadata, 0, 100),
    visualScore: clampInt(result.breakdown.visual, 0, 100),
    aiScore: clampInt(result.breakdown.aiAssessment, 0, 100),
    signalsSummary: signalsSummary.length > 0 ? signalsSummary : ['[LOW] General inspection completed'],
    recommendations:
      recommendations.length > 0
        ? recommendations
        : ['Independently verify primary source attribution.'],
    evidenceSummary: evidenceSummaryText.slice(0, BLUEPRINT_CONSTRAINTS.MAX_EVIDENCE_SUMMARY_LENGTH),
    metadataSummary: metadataSummaryText.slice(0, BLUEPRINT_CONSTRAINTS.MAX_METADATA_SUMMARY_LENGTH),
    explanationWhat: (result.explanation.whatDetected || result.summary).slice(
      0,
      BLUEPRINT_CONSTRAINTS.MAX_EXPLANATION_LENGTH
    ),
    explanationWhy: (result.explanation.whyItMatters || 'Important for authenticity assessment.').slice(
      0,
      BLUEPRINT_CONSTRAINTS.MAX_EXPLANATION_LENGTH
    ),
    explanationVerify: (
      result.explanation.whatToVerify || 'Verify with independent sources.'
    ).slice(0, BLUEPRINT_CONSTRAINTS.MAX_EXPLANATION_LENGTH),
    status: 'completed' as const,
    createdAt: serverTimestamp(),
  };

  try {
    const batch = writeBatch(db);
    batch.set(doc(db, 'analyses', analysisId), payload);

    // Also write individual signals to /analyses/{analysisId}/signals/{signalId}
    result.signals.slice(0, 10).forEach((sig: Signal, idx: number) => {
      const sigId = sanitizeId(sig.id || `sig_${idx + 1}`);
      batch.set(doc(db, 'analyses', analysisId, 'signals', sigId), {
        analysisId,
        userId: uid,
        category: sig.category,
        severity: sig.severity,
        description: (sig.description || 'Signal detected').slice(
          0,
          BLUEPRINT_CONSTRAINTS.MAX_SIGNAL_DESC_LENGTH
        ),
        evidence: (sig.evidence || 'Observed in input').slice(
          0,
          BLUEPRINT_CONSTRAINTS.MAX_SIGNAL_EVIDENCE_LENGTH
        ),
        confidence: Math.max(0, Math.min(1, Number(sig.confidence) || 0.75)),
        createdAt: serverTimestamp(),
      });
    });

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, analysisPath);
  }
}

export async function deleteAnalysisFromFirestore(analysisId: string): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser || !currentUser.emailVerified) return;
  const cleanId = sanitizeId(analysisId);
  const path = `analyses/${cleanId}`;
  try {
    await deleteDoc(doc(db, 'analyses', cleanId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export function subscribeUserAnalyses(
  userId: string,
  onUpdate: (records: AnalysisResult[]) => void
): () => void {
  const cleanUid = sanitizeId(userId);
  const q = query(collection(db, 'analyses'), where('userId', '==', cleanUid));

  return onSnapshot(
    q,
    (snapshot) => {
      const results: AnalysisResult[] = snapshot.docs.map((docSnap) => {
        const d = docSnap.data();
        const createdAtIso =
          d.createdAt && typeof d.createdAt.toDate === 'function'
            ? d.createdAt.toDate().toISOString()
            : new Date().toISOString();
        const riskScore = Number(d.riskScore) || 0;
        const riskTier =
          riskScore <= 30
            ? 'Low Risk'
            : riskScore <= 60
              ? 'Moderate Risk'
              : riskScore <= 80
                ? 'High Risk'
                : 'Very High Risk';

        const signals: Signal[] = Array.isArray(d.signalsSummary)
          ? d.signalsSummary.map((line: string, i: number) => {
              const sevMatch = line.match(/^\[(LOW|MEDIUM|HIGH)\]\s*(\w+):\s*(.*)$/i);
              return {
                id: `fs_sig_${i + 1}`,
                category: (sevMatch?.[2]?.toLowerCase() as Signal['category']) || 'content',
                severity: (sevMatch?.[1]?.toLowerCase() as Signal['severity']) || 'medium',
                description: sevMatch?.[3] || line,
                evidence: String(d.evidenceSummary || 'Stored in Firestore record'),
                confidence: Number(d.confidence) || 0.8,
              };
            })
          : [];

        return {
          id: docSnap.id,
          userId: d.userId,
          analysisType: d.analysisType,
          inputReference: d.inputReference,
          classification: d.classification,
          confidence: Number(d.confidence) || 0.8,
          riskScore,
          riskTier,
          summary: d.summary,
          isDemo: Boolean(d.isDemo),
          breakdown: {
            source: Number(d.sourceScore) || 0,
            content: Number(d.contentScore) || 0,
            metadata: Number(d.metadataScore) || 0,
            visual: Number(d.visualScore) || 0,
            aiAssessment: Number(d.aiScore) || 0,
            weights: { source: 0.2, content: 0.2, metadata: 0.15, image: 0.3, ai: 0.15 },
          },
          signals,
          recommendations: Array.isArray(d.recommendations) ? d.recommendations : [],
          explanation: {
            whatDetected: d.explanationWhat || d.summary,
            whyItMatters: d.explanationWhy || '',
            confidenceReasoning: `Confidence rated at ${Math.round((Number(d.confidence) || 0.8) * 100)}%.`,
            whatToVerify: d.explanationVerify || '',
          },
          executionTimeMs: 250,
          aiModelUsed: d.isDemo ? 'demo-preset-engine' : 'gemini-3.8-flash',
          pipelineSteps: [
            { step: 'Input validated', status: 'completed', detail: 'Restored from Firestore archive' },
            { step: 'Content extracted', status: 'completed', detail: String(d.evidenceSummary || '').slice(0, 90) },
            { step: 'Metadata analyzed', status: 'completed', detail: String(d.metadataSummary || '').slice(0, 90) },
            { step: 'AI authenticity analysis', status: 'completed', detail: 'Probabilistic signals verified' },
            { step: 'Risk assessment', status: 'completed', detail: `Score ${riskScore}/100 (${riskTier})` },
            { step: 'Generating explanation', status: 'completed', detail: 'Complete report loaded' },
          ],
          createdAt: createdAtIso,
          status: d.status || 'completed',
        };
      });

      results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      onUpdate(results);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'analyses');
    }
  );
}

export { onAuthStateChanged, signInWithPopup, signOut, getDocs };
export type { User };
