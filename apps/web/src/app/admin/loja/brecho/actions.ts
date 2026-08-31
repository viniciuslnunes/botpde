'use server'

import { revalidatePath } from 'next/cache'
import { ExpectedError } from '@/lib/expected-error'
import { assertStaffBrecho } from '@/lib/brecho-escopo'
import {
  atenderDenunciaBrecho,
  congelarLojaBrecho,
  resolverDenunciaBrecho,
} from '@/lib/brecho-ticket'

export async function atenderDenunciaBrechoAction(denunciaId: string) {
  const staff = await assertStaffBrecho()
  const r = await atenderDenunciaBrecho(denunciaId, staff.userId, staff.raizId)
  revalidatePath('/admin/loja/brecho')
  return r
}

export async function resolverDenunciaBrechoAction(
  denunciaId: string,
  decisao: 'RESOLVIDA' | 'DESCARTADA',
  ocultarAnuncio?: boolean,
) {
  const staff = await assertStaffBrecho()
  if (!staff.podeGerir && decisao === 'RESOLVIDA' && ocultarAnuncio) {
    throw new ExpectedError('Só quem gerencia a loja oculta anúncios.')
  }
  await resolverDenunciaBrecho(denunciaId, staff.userId, staff.raizId, decisao, ocultarAnuncio)
  revalidatePath('/admin/loja/brecho')
}

export async function congelarLojaBrechoAction(lojaId: string, congelar: boolean) {
  const staff = await assertStaffBrecho()
  if (!staff.podeGerir) throw new ExpectedError('Só quem gerencia a loja suspende vitrines.')
  await congelarLojaBrecho(lojaId, staff.userId, staff.raizId, congelar)
  revalidatePath('/admin/loja/brecho')
}
