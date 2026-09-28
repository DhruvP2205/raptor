'use client';

import { Alert, ApiErrorAlert } from '@/components/ui/Alert';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Textarea } from '@/components/ui/Field';
import { createComment, deleteComment, listComments, updateComment } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import type { CommentWithAuthor } from '@raptor/shared';
import { useEffect, useState } from 'react';

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString();
}

// docs/design/13-comments.md — no standalone screen, embedded directly
// in Module 5's submission detail page. Flat, no threading (stage doc
// Section 4); composer at the bottom (doc's own recommendation for a
// chronological thread), matching the backend's createdAt:asc order.
export function CommentsSection({
  submissionId,
  commentsEnabled,
  isOrganizerOrAdmin,
}: {
  submissionId: string;
  commentsEnabled: boolean;
  isOrganizerOrAdmin: boolean;
}) {
  const { user } = useAuth();
  const [comments, setComments] = useState<CommentWithAuthor[] | null>(null);
  const [error, setError] = useState<unknown>(null);

  const [draft, setDraft] = useState('');
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState<unknown>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState<unknown>(null);

  const [removeTarget, setRemoveTarget] = useState<CommentWithAuthor | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);

  useEffect(() => {
    listComments(submissionId).then(setComments).catch(setError);
  }, [submissionId]);

  async function handlePost() {
    if (!draft.trim() || !user) return;
    setPosting(true);
    setPostError(null);
    try {
      // Post button loading state, textarea stays populated until
      // success — never clear content speculatively (design doc's
      // "never lose what someone typed" principle, same as Module 5's
      // submission form).
      const created = await createComment(submissionId, draft.trim());
      setComments((list) => [...(list ?? []), { ...created, user: { id: user.id, displayName: user.displayName } }]);
      setDraft('');
    } catch (err) {
      setPostError(err);
    } finally {
      setPosting(false);
    }
  }

  function startEdit(comment: CommentWithAuthor) {
    setEditingId(comment.id);
    setEditDraft(comment.body);
    setEditError(null);
  }

  async function saveEdit(commentId: string) {
    setEditBusy(true);
    setEditError(null);
    try {
      const updated = await updateComment(commentId, editDraft.trim());
      setComments((list) =>
        (list ?? []).map((c) => (c.id === commentId ? { ...c, body: updated.body, editedAt: updated.editedAt } : c)),
      );
      setEditingId(null);
    } catch (err) {
      setEditError(err);
    } finally {
      setEditBusy(false);
    }
  }

  async function handleSelfDelete(commentId: string) {
    // No confirmation modal — self-deletion needs no reason, matching
    // Module 4's team-leave precedent for low-stakes self-actions.
    try {
      await deleteComment(commentId);
      setComments((list) => (list ?? []).filter((c) => c.id !== commentId));
    } catch (err) {
      setError(err);
    }
  }

  async function submitRemove(reason?: string) {
    if (!removeTarget) return;
    setRemoveBusy(true);
    try {
      await deleteComment(removeTarget.id, reason);
      setComments((list) => (list ?? []).filter((c) => c.id !== removeTarget.id));
      setRemoveTarget(null);
    } catch (err) {
      setError(err);
    } finally {
      setRemoveBusy(false);
    }
  }

  const eligible = !!user?.emailVerifiedAt;

  return (
    <div className="mt-8">
      <h2 className="mb-3 font-display text-lg text-ink">Comments</h2>
      <ApiErrorAlert error={error} />

      {comments === null ? (
        <p className="text-sm text-ink-muted">Loading…</p>
      ) : comments.length === 0 ? (
        <p className="text-sm text-ink-muted">No comments yet.</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {comments.map((comment) => {
            const isMine = user?.id === comment.userId;
            return (
              <li key={comment.id} className="flex gap-3">
                <Avatar name={comment.user.displayName} id={comment.user.id} />
                <div className="flex-1">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="text-sm font-medium text-ink">{comment.user.displayName}</span>
                    <span className="text-xs text-ink-faint">{formatTimestamp(comment.createdAt)}</span>
                    {comment.editedAt && <span className="text-xs text-ink-faint">(edited)</span>}
                  </div>
                  {editingId === comment.id ? (
                    <div className="mt-1.5">
                      <Textarea minRows={2} value={editDraft} onChange={(e) => setEditDraft(e.target.value)} />
                      <ApiErrorAlert error={editError} />
                      <div className="mt-1.5 flex gap-2">
                        <Button
                          size="sm"
                          loading={editBusy}
                          disabled={!editDraft.trim()}
                          onClick={() => saveEdit(comment.id)}
                        >
                          Save
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{comment.body}</p>
                      <div className="mt-1 flex gap-3">
                        {isMine && (
                          <>
                            <button
                              type="button"
                              onClick={() => startEdit(comment)}
                              className="text-xs text-ink-muted hover:text-accent"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSelfDelete(comment.id)}
                              className="text-xs text-ink-muted hover:text-danger"
                            >
                              Delete
                            </button>
                          </>
                        )}
                        {!isMine && isOrganizerOrAdmin && (
                          <button
                            type="button"
                            onClick={() => setRemoveTarget(comment)}
                            className="text-xs text-ink-muted hover:text-danger"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-6 border-t border-line pt-4">
        {!commentsEnabled ? (
          <Alert tone="neutral">Comments are closed for this event.</Alert>
        ) : !eligible ? (
          <p className="text-sm text-ink-muted">Sign in with a verified email to comment.</p>
        ) : (
          <div>
            <Textarea minRows={2} placeholder="Add a comment…" value={draft} onChange={(e) => setDraft(e.target.value)} />
            <ApiErrorAlert error={postError} />
            <Button size="sm" className="mt-2" loading={posting} disabled={!draft.trim()} onClick={handlePost}>
              Post
            </Button>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={removeTarget !== null}
        title="Remove this comment?"
        description="This is a moderation action and requires a reason."
        confirmLabel="Remove comment"
        requireReason
        loading={removeBusy}
        onConfirm={submitRemove}
        onCancel={() => setRemoveTarget(null)}
      />
    </div>
  );
}
