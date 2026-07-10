import { getStoryRings } from '@/lib/stories'
import { StoryRings } from '@/components/portal/story-rings'

interface ComunidadeStoriesSectionProps {
  tenantId: string
  currentUser: {
    id: string
    nome: string | null
    avatarUrl: string | null
  }
}

export async function ComunidadeStoriesSection({
  tenantId,
  currentUser,
}: ComunidadeStoriesSectionProps) {
  if (!currentUser.id) return null

  const rings = await getStoryRings(tenantId, currentUser.id)
  if (rings.length === 0) {
    return (
      <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4 py-3">
        <StoryRings
          rings={[]}
          currentUserId={currentUser.id}
          currentUserNome={currentUser.nome}
          currentUserAvatar={currentUser.avatarUrl}
        />
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4 py-3">
      <StoryRings
        rings={rings}
        currentUserId={currentUser.id}
        currentUserNome={currentUser.nome}
        currentUserAvatar={currentUser.avatarUrl}
      />
    </div>
  )
}
