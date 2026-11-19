import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { Artifact, CommentRef, TaskComment } from '../../api'
import { MarkdownView, MarkdownWithRefs } from '../../components/MarkdownView'
import { CommentRefChip } from './CommentRefChip'

type Props = {
  taskId: string
  source: string
  refs: CommentRef[]
  artifacts: Artifact[]
  commentsById?: Map<number, TaskComment>
}

/** Keep only refs whose span still matches the live source (draft may diverge). */
function matchingRefs(source: string, refs: CommentRef[]): CommentRef[] {
  return refs.filter(
    (ref) =>
      ref.start >= 0 &&
      ref.end > ref.start &&
      ref.end <= source.length &&
      source.slice(ref.start, ref.end) === ref.raw,
  )
}

/** Description preview — same markdown + ref chips as comments. */
export function DescriptionPreview({
  taskId,
  source,
  refs,
  artifacts,
  commentsById,
}: Props) {
  const { t } = useTranslation('detail')
  const activeRefs = useMemo(() => matchingRefs(source, refs), [source, refs])
  const empty = <p className="muted small wm-md-empty">{t('descriptionEmptyPreview')}</p>

  if (!source.trim()) {
    return empty
  }

  if (activeRefs.length === 0) {
    return <MarkdownView source={source} className="notes-preview" />
  }

  return (
    <MarkdownWithRefs
      source={source}
      refs={activeRefs}
      className="notes-preview"
      renderRef={(ref, key) => (
        <CommentRefChip
          key={key}
          taskId={taskId}
          commentRef={ref}
          artifacts={artifacts}
          commentsById={commentsById ?? EMPTY_COMMENTS}
        />
      )}
    />
  )
}

const EMPTY_COMMENTS = new Map<number, TaskComment>()
