import { NextRequest, NextResponse } from 'next/server'
import { buscarTypeaheadListagem, specPorId } from '@/lib/listagem/typeahead'

function searchParamsRecord(url: URL): Record<string, string | string[] | undefined> {
  const out: Record<string, string | string[] | undefined> = {}
  url.searchParams.forEach((value, key) => {
    const prev = out[key]
    if (prev === undefined) {
      out[key] = value
    } else if (Array.isArray(prev)) {
      prev.push(value)
    } else {
      out[key] = [prev, value]
    }
  })
  return out
}

export async function GET(request: NextRequest) {
  const specId = request.nextUrl.searchParams.get('spec')?.trim() ?? ''
  if (!specId || !specPorId(specId)) {
    return NextResponse.json({ error: 'Listagem inválida.' }, { status: 400 })
  }

  try {
    const params = searchParamsRecord(request.nextUrl)
    delete params.spec
    const itens = await buscarTypeaheadListagem(specId, params)
    return NextResponse.json({ itens })
  } catch {
    return NextResponse.json({ error: 'Acesso negado.' }, { status: 401 })
  }
}
