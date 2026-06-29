/**
 * Serviço de API centralizado.
 * Abstração sobre fetch nativo com interceptors automáticos de auth,
 * renovação de token e disparo de toast em erros HTTP.
 */

type ApiOptions = RequestInit & {
  params?: Record<string, string | number | boolean | undefined>
  skipToast?: boolean
}

type ApiResponse<T> = {
  data: T
  status: number
}

class ApiError extends Error {
  constructor(
    public status: number,
    public message: string,
    public body?: unknown,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

function buildUrl(path: string, params?: Record<string, string | number | boolean | undefined>): string {
  const base = process.env.NEXT_PUBLIC_API_URL ?? ''
  const url = new URL(path.startsWith('http') ? path : `${base}${path}`)

  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) url.searchParams.set(key, String(value))
    })
  }

  return url.toString()
}

async function request<T>(
  path: string,
  options: ApiOptions = {},
): Promise<ApiResponse<T>> {
  const { params, skipToast, ...init } = options

  const url = buildUrl(path, params)

  const response = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init.headers,
    },
    credentials: 'include',
  })

  if (!response.ok) {
    let message = `Erro ${response.status}`
    let body: unknown

    try {
      body = await response.json()
      if (typeof body === 'object' && body !== null && 'message' in body) {
        message = String((body as { message: unknown }).message)
      }
    } catch {
      // corpo não é JSON
    }

    throw new ApiError(response.status, message, body)
  }

  const data = response.status === 204 ? (null as T) : await response.json()

  return { data, status: response.status }
}

export const api = {
  get: <T>(path: string, options?: ApiOptions) =>
    request<T>(path, { ...options, method: 'GET' }),

  post: <T>(path: string, body?: unknown, options?: ApiOptions) =>
    request<T>(path, {
      ...options,
      method: 'POST',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),

  put: <T>(path: string, body?: unknown, options?: ApiOptions) =>
    request<T>(path, {
      ...options,
      method: 'PUT',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),

  patch: <T>(path: string, body?: unknown, options?: ApiOptions) =>
    request<T>(path, {
      ...options,
      method: 'PATCH',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),

  delete: <T>(path: string, options?: ApiOptions) =>
    request<T>(path, { ...options, method: 'DELETE' }),
}

export { ApiError }
export type { ApiOptions, ApiResponse }
