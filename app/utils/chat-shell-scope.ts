/**
 * Soft-nav reuses clientEntry instances and updates handle.props without re-running
 * setup. Scope keys detect when SSR props mean a different chat than setup-scope state.
 */

export function chatShellScopeKey(
  knowledgeId: string | null | undefined,
  conversationId: string | null | undefined,
): string {
  return `${knowledgeId ?? ''}\0${conversationId ?? ''}`
}
