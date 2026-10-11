/**
 * TruthLens AI — Firestore Security Rules Verification Suite
 * Verifies that all "Dirty Dozen" adversarial payloads in security_spec.md
 * are rejected with PERMISSION_DENIED.
 */

export interface DirtyDozenTestCase {
  id: number;
  name: string;
  collectionPath: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  expectedOutcome: 'PERMISSION_DENIED';
  guardVerified: string;
}

export const DIRTY_DOZEN_TEST_CASES: DirtyDozenTestCase[] = [
  {
    id: 1,
    name: 'Shadow Field Injection on Analysis Create',
    collectionPath: '/analyses/analysis_001',
    operation: 'create',
    expectedOutcome: 'PERMISSION_DENIED',
    guardVerified: 'data.keys().hasOnly(...) rejects unknown shadow fields',
  },
  {
    id: 2,
    name: 'Identity Spoofing on Analysis Create',
    collectionPath: '/analyses/analysis_002',
    operation: 'create',
    expectedOutcome: 'PERMISSION_DENIED',
    guardVerified: 'data.userId == request.auth.uid',
  },
  {
    id: 3,
    name: 'Unverified Email Admin Spoofing',
    collectionPath: '/analyses/victim_analysis',
    operation: 'get',
    expectedOutcome: 'PERMISSION_DENIED',
    guardVerified: 'request.auth.token.email_verified == true in isAdmin()',
  },
  {
    id: 4,
    name: 'Cross-User PII Read on /users/{userId}/private/info',
    collectionPath: '/users/victim_uid/private/info',
    operation: 'get',
    expectedOutcome: 'PERMISSION_DENIED',
    guardVerified: 'Split collection PII guard restricts read to isOwner(userId) || isAdmin()',
  },
  {
    id: 5,
    name: 'Unbounded String / Denial of Wallet Attack',
    collectionPath: '/analyses/analysis_005',
    operation: 'create',
    expectedOutcome: 'PERMISSION_DENIED',
    guardVerified: 'data.summary.size() <= 3000 boundary check',
  },
  {
    id: 6,
    name: 'Document ID Poisoning',
    collectionPath: '/analyses/invalid$id!with*spaces',
    operation: 'create',
    expectedOutcome: 'PERMISSION_DENIED',
    guardVerified: 'isValidId(analysisId) regex guard ^[a-zA-Z0-9_\\-]+$',
  },
  {
    id: 7,
    name: 'Orphaned Subcollection Signal Write',
    collectionPath: '/analyses/non_existent_analysis/signals/sig_1',
    operation: 'create',
    expectedOutcome: 'PERMISSION_DENIED',
    guardVerified: 'Master Gate get() parent ownership check',
  },
  {
    id: 8,
    name: 'Forged Client Timestamp',
    collectionPath: '/users/user_1',
    operation: 'create',
    expectedOutcome: 'PERMISSION_DENIED',
    guardVerified: 'incoming().createdAt == request.time',
  },
  {
    id: 9,
    name: 'Terminal State Mutation on Archived Analysis',
    collectionPath: '/analyses/archived_analysis_1',
    operation: 'update',
    expectedOutcome: 'PERMISSION_DENIED',
    guardVerified: "existing().status != 'archived' terminal state lock",
  },
  {
    id: 10,
    name: 'Value Poisoning on Analysis Update',
    collectionPath: '/analyses/active_analysis_1',
    operation: 'update',
    expectedOutcome: 'PERMISSION_DENIED',
    guardVerified: 'isValidAnalysis(incoming()) wraps allow update block',
  },
  {
    id: 11,
    name: 'Unauthorized Blanket List Query on /analyses',
    collectionPath: '/analyses',
    operation: 'list',
    expectedOutcome: 'PERMISSION_DENIED',
    guardVerified: 'resource.data.userId == request.auth.uid in allow list',
  },
  {
    id: 12,
    name: 'Self-Granted Admin Escalation',
    collectionPath: '/admins/user_1',
    operation: 'create',
    expectedOutcome: 'PERMISSION_DENIED',
    guardVerified: 'allow write: if false on /admins/{adminId}',
  },
];
