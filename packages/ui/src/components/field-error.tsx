/** Mensagem de erro de campo de formulário — usa o primeiro erro da lista (padrão zod/useActionState). */
export function FieldError({ errors }: { errors?: string[] }) {
  if (!errors?.length) return null
  return <p className="mt-1 text-xs text-red-500">{errors[0]}</p>
}
