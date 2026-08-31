/** Sem `'use client'`: o layout raiz importa o script no Server Component. */

export const THEME_STORAGE_KEY = 'torcida-theme'
export const THEME_DEFAULT = 'dark' as const
export type ColorMode = 'light' | 'dark'

/**
 * Roda no HTML do servidor, antes do paint. Não pode viver no ThemeProvider
 * (Client Component): React 19 recusa `<script>` no client e avisa no console.
 */
export const themeBlockingScript = `(function(){try{var d=document.documentElement;var t=localStorage.getItem('${THEME_STORAGE_KEY}');var m=t==='light'?'light':'${THEME_DEFAULT}';d.classList.remove('light','dark');d.classList.add(m);d.style.colorScheme=m}catch(e){document.documentElement.classList.add('${THEME_DEFAULT}');document.documentElement.style.colorScheme='${THEME_DEFAULT}'}})()`
