/** Build reorder API body after moving activeId within ordered sibling ids. */
export function reorderBodyAfterMove(
  orderedIds: string[],
  activeId: string,
): { before_task_id?: string; after_task_id?: string } {
  const index = orderedIds.indexOf(activeId)
  if (index <= 0) {
    const next = orderedIds[1]
    return next != null ? { before_task_id: next } : {}
  }
  return { after_task_id: orderedIds[index - 1] }
}

/** Assign spaced ranks so the UI sort matches `orderedIds` immediately. */
export function ranksForOrder(orderedIds: string[]): Map<string, number> {
  const ranks = new Map<string, number>()
  orderedIds.forEach((id, index) => {
    ranks.set(id, (index + 1) * 1000)
  })
  return ranks
}
