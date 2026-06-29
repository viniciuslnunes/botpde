import { z } from 'zod'
import { ALL_PERMISSIONS } from '../permissions.js'

export const CriarRoleSchema = z.object({
  nome: z.string().min(2).max(50),
  cor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Cor inválida')
    .default('#6b7280'),
  ordem: z.number().int().default(0),
  permissions: z
    .array(z.enum(/** @type {[string, ...string[]]} */ (ALL_PERMISSIONS)))
    .default([]),
})

export const UpdateRoleSchema = CriarRoleSchema.partial()

export const AtribuirRoleSchema = z.object({
  userId: z.string().uuid(),
  roleId: z.string().uuid(),
})

export const SetPermissaoIndividualSchema = z.object({
  userId: z.string().uuid(),
  permission: z.enum(/** @type {[string, ...string[]]} */ (ALL_PERMISSIONS)),
  granted: z.boolean(),
})
