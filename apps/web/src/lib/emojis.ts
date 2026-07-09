/** Conjunto curado de emojis por categoria — sem dependência externa. */
export interface EmojiCategory {
  id: string
  label: string
  icon: string
  emojis: string[]
}

export const EMOJI_CATEGORIES: EmojiCategory[] = [
  {
    id: 'torcida',
    label: 'Torcida',
    icon: '⚽',
    emojis: ['⚽', '🏆', '🥇', '🎉', '🎊', '🔥', '💪', '🙌', '👏', '🚩', '🏟️', '📣', '🥁', '🎺', '🎇', '🖤', '🤍', '❤️', '💛', '💚', '💙', '💜', '🧡'],
  },
  {
    id: 'rostos',
    label: 'Rostos',
    icon: '😀',
    emojis: ['😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '😇', '🙂', '😉', '😍', '🥰', '😘', '😎', '🤩', '🥳', '😜', '🤪', '😏', '😒', '😞', '😔', '😢', '😭', '😤', '😠', '😡', '🤬', '😱', '😳', '🥶', '😰', '🤔', '🤯'],
  },
  {
    id: 'gestos',
    label: 'Gestos',
    icon: '👍',
    emojis: ['👍', '👎', '👌', '✌️', '🤞', '🤟', '🤙', '👊', '✊', '🙏', '👐', '🤝', '💅', '👋', '🫶', '🫡', '🤌', '☝️', '✋', '🖐️'],
  },
  {
    id: 'coracoes',
    label: 'Corações',
    icon: '❤️',
    emojis: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❤️‍🔥', '💯', '💥', '✨', '⭐', '🌟', '💫', '⚡'],
  },
  {
    id: 'objetos',
    label: 'Objetos',
    icon: '🎁',
    emojis: ['🎁', '🍺', '🍻', '🥂', '🍾', '🍕', '🍔', '🌭', '🎸', '📸', '📱', '💰', '🎯', '🎮', '🏁', '🚌', '✈️', '🚗', '📅', '📍', '⏰', '☀️', '🌧️', '🌙'],
  },
]
