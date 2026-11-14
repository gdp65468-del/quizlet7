# Firestore Security Specification (`security_spec.md`)

## 1. Data Invariants
1. **Default Deny**: Every unmatched path is denied (`allow read, write: if false`).
2. **Verified Identity**: All reads and writes require `request.auth != null` and `request.auth.token.email_verified == true`.
3. **Quiz Ownership & Immutability**: A `QuizDocument` under `/quizzes/{quizDocId}` must have `ownerId == request.auth.uid`, valid ID format (`^[a-zA-Z0-9_-]+$`), bounded `name` (1–140 chars), bounded `questions` list (1–100 items), and immutable `createdAt`/`ownerId` on update.
4. **Game Session Report Ownership & Integrity**: A `GameSessionReport` under `/gameSessions/{sessionId}` must have `ownerId == request.auth.uid`, valid bounded `leaderboard` (<= 500 entries) and `questionStats` (<= 100 entries), server timestamp `completedAt == request.time` on create, and only `classLabel` mutable by the owner during updates.
5. **Admin Isolation**: `/admins/{userId}` can only be read by the matching user or an existing admin; client writes cannot escalate privileges unless already bootstrapped by verified admin email.
6. **Query Enforcer**: `allow list` on `/quizzes` and `/gameSessions` explicitly checks `resource.data.ownerId == request.auth.uid` (no `get()` or `exists()` in `allow list`).

## 2. "Dirty Dozen" Adversarial Payloads (All Must Return PERMISSION_DENIED)
1. Unauthenticated read on `/quizzes/demo-quiz`.
2. Unauthenticated write on `/gameSessions/sess-1`.
3. Unverified email (`email_verified: false`) attempting to create `/quizzes/q1`, even if email matches admin.
4. Cross-user read (`get`) on `/quizzes/q1` owned by `userA` when signed in as `userB`.
5. Blanket `list` query on `/gameSessions` without `where('ownerId', '==', uid)` filter.
6. Identity spoofing on create: `ownerId: "victimUid"` when `request.auth.uid == "attackerUid"`.
7. Shadow/Ghost field injection on create: `{ ...validQuiz, isAdminApproved: true }`.
8. Oversized ID injection: document ID > 128 chars or containing invalid characters (`../etc`).
9. Type/Value poisoning on update: updating `gameSessions/{id}` `classLabel` to a boolean or string > 80 chars.
10. Immutable field mutation on update: changing `ownerId` or `createdAt` on `/quizzes/{id}`.
11. Unbounded array DoS: `questions` array with 0 elements or > 100 elements.
12. Fake client timestamp on create: `createdAt: Timestamp.fromDate(new Date(0))` instead of `serverTimestamp()`.
