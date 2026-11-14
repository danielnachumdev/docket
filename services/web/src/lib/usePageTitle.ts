import { useEffect } from 'react'
import i18n from '../i18n'

export function usePageTitle(title: string | null | undefined) {
  useEffect(() => {
    const app = i18n.t('appName', { ns: 'common' })
    document.title = title ? `${title} · ${app}` : app
  }, [title])
}
