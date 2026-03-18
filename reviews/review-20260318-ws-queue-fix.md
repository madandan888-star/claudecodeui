---
date: 2026-03-18
target: uncommitted (WebSocketContext.tsx, useChatRealtimeHandlers.ts)
mode: single
scope: websocket, streaming, react-state
rounds: 1/1
---

# Codex Review: WebSocket message queue fix (React 18 batching)

## P1 (Must Fix) — ALL FIXED

1. **sendMessage type mismatch** — `void→boolean` change in WebSocketContext not propagated to ChatInterfaceProps, MainContentProps, useChatComposerState.
   - Fixed: updated all 3 type declarations.

2. **Queue exception safety** — `splice(0)` clears queue before processing; thrown exception drops remaining batch.
   - Fixed: wrapped loop body in try-catch. Each message failure is logged but doesn't block subsequent messages.

## P2 (Should Fix) — ACCEPTED AS-IS

3. **Stale render-snapshot in same batch** — `session-created` + `session-status` in one drain could see stale `currentSessionId`.
   - Assessment: Low practical impact. Ref mutations (pendingViewSessionRef, sessionStorage) ARE visible within the same batch. Only React state (`currentSessionId`) lags, same as before the fix (React batches state updates across consecutive effects too).

4. **Other consumers still use lossy latestMessage** — useProjectsState, TaskMasterContext.
   - Assessment: Intentional. These handle infrequent messages (project updates, task updates) where batching losses are astronomically unlikely. Adding per-consumer queues would add complexity without solving a real problem.

## P3 (Nice to Fix) — FIXED

5. **Queue not cleared on teardown** — stale messages could persist across reconnections.
   - Fixed: added `messageQueueRef.current.length = 0` in useEffect cleanup.

## Responses (disagreements with Codex)

- Finding 3: Codex treats this as Medium but the stale-state window is identical to pre-fix behavior (React batching delays state updates regardless). The queue approach actually *improves* ref-based state consistency within a batch.
- Finding 4: By design. Chat streaming is the only high-frequency path affected by React 18 batching.

## Verification

- `tsc --noEmit`: 0 errors
- `npm run build`: success (3.44s)
