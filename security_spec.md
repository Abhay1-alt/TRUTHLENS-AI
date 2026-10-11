# TruthLens AI — Firestore Security Specification (Phase 0 TDD)

## 1. Data Invariants & Master Source of Truth

1. **Global Default Deny**: Any path not explicitly matched in `firestore.rules` is unconditionally denied (`allow read, write: if false;`).
2. **Verified Identity Gate**: All write operations require an authenticated user (`request.auth != null`) with a verified email (`request.auth.token.email_verified == true`).
3. **PII Split-Collection Isolation**: User email addresses are strictly isolated inside `/users/{userId}/private/{docId}` (`docId == 'info'`) and are readable/writable only by the owner (`request.auth.uid == userId`) or a verified Admin.
4. **Analysis Ownership Invariant**: An `/analyses/{analysisId}` document can only be created if `incoming().userId == request.auth.uid` and `incoming().createdAt == request.time`.
5. **Master Gate for Subcollections (`/analyses/{analysisId}/signals/{signalId}`)**: A signal cannot exist or be read/written unless the parent `/analyses/{analysisId}` document exists and its `userId` matches `request.auth.uid` (or the caller is an Admin).
6. **Terminal State Locking**: Once an `/analyses/{analysisId}` document reaches `status == 'archived'`, no subsequent updates are permitted except by an Admin.
7. **Strict Key & Size Enforcement**: Every entity validation helper enforces `hasAll` and `hasOnly` key allowlists, regex ID validation (`^[a-zA-Z0-9_\-]+$`), bounded string lengths, and bounded list sizes.
8. **Secure List Queries**: `allow list` on `/analyses/{analysisId}` strictly enforces `resource.data.userId == request.auth.uid || isAdmin()`.

---

## 2. The "Dirty Dozen" Adversarial Payloads

### Payload 1: Shadow Field Injection (Anti-Update-Gap)
```json
{
  "collection": "/analyses/analysis_001",
  "operation": "create",
  "auth": { "uid": "user_1", "email_verified": true },
  "data": {
    "userId": "user_1",
    "analysisType": "url",
    "inputReference": "https://example.com",
    "classification": "SUSPICIOUS",
    "confidence": 0.82,
    "riskScore": 74,
    "summary": "Suspicious signals detected.",
    "isDemo": false,
    "sourceScore": 70,
    "contentScore": 75,
    "metadataScore": 60,
    "visualScore": 0,
    "aiScore": 80,
    "signalsSummary": ["Missing author"],
    "recommendations": ["Verify source"],
    "evidenceSummary": "Domain example.com",
    "metadataSummary": "No schema.org",
    "explanationWhat": "Detected missing byline.",
    "explanationWhy": "Reduces accountability.",
    "explanationVerify": "Cross-check wire services.",
    "status": "completed",
    "createdAt": "SERVER_TIMESTAMP",
    "isVerifiedByForensicsLab": true
  }
}
```
*Expected*: `PERMISSION_DENIED` (blocked by `hasOnly`).

### Payload 2: Identity Spoofing on Analysis Creation
```json
{
  "collection": "/analyses/analysis_002",
  "operation": "create",
  "auth": { "uid": "attacker_uid", "email_verified": true },
  "data": {
    "userId": "victim_uid",
    "analysisType": "url",
    "inputReference": "https://example.com"
  }
}
```
*Expected*: `PERMISSION_DENIED` (`incoming().userId == request.auth.uid` fails).

### Payload 3: Unverified Email Admin Spoofing
```json
{
  "collection": "/analyses/victim_analysis",
  "operation": "get",
  "auth": {
    "uid": "spoof_admin",
    "email": "abhaymishrakarma686@gmail.com",
    "email_verified": false
  }
}
```
*Expected*: `PERMISSION_DENIED` (`email_verified == true` required for bootstrapped admin).

### Payload 4: Cross-User PII Read on `/users/{userId}/private/info`
```json
{
  "collection": "/users/victim_uid/private/info",
  "operation": "get",
  "auth": { "uid": "other_user_uid", "email_verified": true }
}
```
*Expected*: `PERMISSION_DENIED` (PII strictly isolated to owner or admin).

### Payload 5: Unbounded String / Denial of Wallet Attack
```json
{
  "collection": "/analyses/analysis_005",
  "operation": "create",
  "auth": { "uid": "user_1", "email_verified": true },
  "data": {
    "userId": "user_1",
    "summary": "<50,000 character string exceeding maxLength 3000>"
  }
}
```
*Expected*: `PERMISSION_DENIED` (`data.summary.size() <= 3000` fails).

### Payload 6: Document ID Poisoning
```json
{
  "collection": "/analyses/invalid$id!with*spaces",
  "operation": "create",
  "auth": { "uid": "user_1", "email_verified": true }
}
```
*Expected*: `PERMISSION_DENIED` (`isValidId(analysisId)` regex guard fails).

### Payload 7: Orphaned Subcollection Signal Write (Master Gate Bypass)
```json
{
  "collection": "/analyses/non_existent_analysis/signals/sig_1",
  "operation": "create",
  "auth": { "uid": "user_1", "email_verified": true },
  "data": {
    "analysisId": "non_existent_analysis",
    "userId": "user_1",
    "category": "source",
    "severity": "high",
    "description": "Orphaned signal",
    "evidence": "None",
    "confidence": 0.9,
    "createdAt": "SERVER_TIMESTAMP"
  }
}
```
*Expected*: `PERMISSION_DENIED` (Parent `/analyses/non_existent_analysis` must exist and belong to `user_1`).

### Payload 8: Forged Client Timestamp (`createdAt != request.time`)
```json
{
  "collection": "/users/user_1",
  "operation": "create",
  "auth": { "uid": "user_1", "email_verified": true },
  "data": {
    "uid": "user_1",
    "displayName": "Alice",
    "createdAt": "2020-01-01T00:00:00Z"
  }
}
```
*Expected*: `PERMISSION_DENIED` (`incoming().createdAt == request.time` fails).

### Payload 9: Terminal State Mutation (`status == 'archived'`)
```json
{
  "collection": "/analyses/archived_analysis_1",
  "operation": "update",
  "auth": { "uid": "user_1", "email_verified": true },
  "existingData": { "status": "archived", "userId": "user_1" },
  "incomingData": { "status": "completed", "userId": "user_1" }
}
```
*Expected*: `PERMISSION_DENIED` (Terminal state `archived` cannot be updated by non-admin).

### Payload 10: Value Poisoning on Update (Invalid Risk Score Range)
```json
{
  "collection": "/analyses/active_analysis_1",
  "operation": "update",
  "auth": { "uid": "user_1", "email_verified": true },
  "incomingData": { "riskScore": 9999, "status": "archived" }
}
```
*Expected*: `PERMISSION_DENIED` (`isValidAnalysis(incoming())` enforces `riskScore >= 0 && riskScore <= 100` and action-based update only allows `status`).

### Payload 11: Unauthorized Blanket List Query on `/analyses`
```json
{
  "collection": "/analyses",
  "operation": "list",
  "auth": { "uid": "user_1", "email_verified": true },
  "query": "collection('analyses') /* without where('userId', '==', 'user_1') */"
}
```
*Expected*: `PERMISSION_DENIED` (`resource.data.userId == request.auth.uid` enforced in `allow list`).

### Payload 12: Self-Granted Admin Escalation
```json
{
  "collection": "/admins/user_1",
  "operation": "create",
  "auth": { "uid": "user_1", "email_verified": true },
  "data": { "uid": "user_1", "createdAt": "SERVER_TIMESTAMP" }
}
```
*Expected*: `PERMISSION_DENIED` (`/admins/{adminId}` is strictly read-only for clients; `allow write: if false`).
