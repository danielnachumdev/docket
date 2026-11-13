import { useState, type FormEvent } from 'react'
import { api } from '../../api'
import { Alert } from '../../components/Feedback'
import { Icon } from '../../components/Icon'
import { Section } from '../../components/Section'
import { useAction } from '../../lib/useAction'

type Props = {
  taskId: number
  onChanged: () => Promise<void>
}

export function CommentsSection({ taskId, onChanged }: Props) {
  const [body, setBody] = useState('')
  const { busy, error, setError, run } = useAction()

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!body.trim()) return
    void run(async () => {
      await api.addComment(taskId, body.trim())
      setBody('')
      await onChanged()
      window.dispatchEvent(new Event('docket:notifications'))
    }, 'Could not add comment')
  }

  return (
    <Section icon="message" title="Comments">
      {error && <Alert onDismiss={() => setError(null)}>{error}</Alert>}
      <form className="comment-form" onSubmit={onSubmit}>
        <label className="field">
          <span className="sr-only">Comment</span>
          <textarea
            rows={3}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Add a comment… Use @email@example.com to mention someone"
            disabled={busy}
          />
        </label>
        <button type="submit" className="btn" disabled={busy || !body.trim()}>
          <Icon name="plus" />
          Comment
        </button>
      </form>
    </Section>
  )
}
