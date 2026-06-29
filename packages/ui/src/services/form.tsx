'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import {
  useForm,
  type DefaultValues,
  type FieldValues,
  type UseFormReturn,
} from 'react-hook-form'
import type { ZodType } from 'zod'

/**
 * Hook de formulário padronizado.
 * Combina react-hook-form + Zod resolver com configurações consistentes.
 * O schema Zod é o mesmo usado na validação da API — impossível dessincronizar.
 */
export function useAppForm<T extends FieldValues>(
  schema: ZodType<T>,
  defaultValues?: DefaultValues<T>,
): UseFormReturn<T> {
  return useForm<T>({
    resolver: zodResolver(schema),
    defaultValues,
    mode: 'onBlur',
  })
}
