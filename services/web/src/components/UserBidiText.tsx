import type { ElementType, HTMLAttributes, ReactNode } from 'react'
import { userBidiAttrs } from '../lib/bidi'

type Props = {
  text: string
  as?: ElementType
  className?: string
  children?: ReactNode
} & Omit<HTMLAttributes<HTMLElement>, 'children' | 'className' | 'dir'>

/** Display wrapper for user-authored text with mixed LTR/RTL ordering fix. */
export function UserBidiText({ text, as: Tag = 'span', className, children, ...rest }: Props) {
  const attrs = userBidiAttrs(text, className)
  return (
    <Tag {...rest} className={attrs.className} dir={attrs.dir}>
      {children ?? text}
    </Tag>
  )
}
