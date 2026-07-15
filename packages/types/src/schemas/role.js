import { z } from 'zod'
import { ALL_PERMISSIONS, PAPEL_DEPARTAMENTO } from '../permissions.js'

const PapelNoDepartamentoSchema = z.enum([
  PAPEL_DEPARTAMENTO.MEMBRO,
  PAPEL_DEPARTAMENTO.GESTOR,
])

const RoleFieldsSchema = z.object({
  nome: z.string().min(2).max(80),
  cor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Cor inválida')
    .default('#6b7280'),
  ordem: z.number().int().default(0),
  /** Transversal: lista completa. De área: preferir vazio e usar extras. */
  permissions: z
    .array(z.enum(/** @type {[string, ...string[]]} */ (ALL_PERMISSIONS)))
    .default([]),
  permissionsExtras: z
    .array(z.enum(/** @type {[string, ...string[]]} */ (ALL_PERMISSIONS)))
    .default([]),
  departamentoId: z.string().uuid().nullable().optional(),
  papelNoDepartamento: PapelNoDepartamentoSchema.nullable().optional(),
})

function refineDepartamentoPapel(data, ctx) {
  const hasDepto = Boolean(data.departamentoId)
  const hasPapel = Boolean(data.papelNoDepartamento)
  if (hasDepto !== hasPapel) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Departamento e papel (membro/gestor) devem ser informados juntos.',
      path: hasDepto ? ['papelNoDepartamento'] : ['departamentoId'],
    })
  }
}

export const CriarRoleSchema = RoleFieldsSchema.superRefine(refineDepartamentoPapel)

export const UpdateRoleSchema = RoleFieldsSchema.partial().superRefine((data, ctx) => {
  if (data.departamentoId === undefined && data.papelNoDepartamento === undefined) return
  refineDepartamentoPapel(
    {
      departamentoId: data.departamentoId,
      papelNoDepartamento: data.papelNoDepartamento,
    },
    ctx,
  )
})

export const AtribuirRoleSchema = z.object({
  userId: z.string().uuid(),
  roleId: z.string().uuid(),
})

export const SetPermissaoIndividualSchema = z.object({
  userId: z.string().uuid(),
  permission: z.enum(/** @type {[string, ...string[]]} */ (ALL_PERMISSIONS)),
  granted: z.boolean(),
})

export const SalvarPerfilCompostoSchema = z
  .object({
    nome: z.string().min(2).max(80),
    cor: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/, 'Cor inválida')
      .default('#6b7280'),
    departamentoId: z.string().uuid().nullable().optional(),
    papelNoDepartamento: PapelNoDepartamentoSchema.nullable().optional(),
    permissionsExtras: z
      .array(z.enum(/** @type {[string, ...string[]]} */ (ALL_PERMISSIONS)))
      .default([]),
  })
  .superRefine(refineDepartamentoPapel)
