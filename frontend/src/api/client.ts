function readCookie(name: string): string | null {
    const match = document.cookie
        .split(';')
        .map(c => c.trim())
        .find(c => c.startsWith(`${name}=`))
    if (!match) return null
    return decodeURIComponent(match.slice(name.length + 1))
}

function buildHeaders(method: string, extra?: HeadersInit): HeadersInit {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    const m = method.toUpperCase()
    if (m !== 'GET' && m !== 'HEAD' && m !== 'OPTIONS') {
        const token = readCookie('csrf_token')
        if (token) headers['X-CSRF-Token'] = token
    }
    return { ...headers, ...(extra as Record<string, string> | undefined) }
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
    const method = options?.method ?? 'GET'
    const res = await fetch(url, {
        credentials: 'include',
        ...options,
        headers: buildHeaders(method, options?.headers),
    })
    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }))
        throw new Error(err.error ?? 'Request failed')
    }
    return res.json()
}

export const api = {
    get: <T>(url: string) => request<T>(url),
    post: <T>(url: string, body?: unknown) =>
        request<T>(url, { method: 'POST', body: JSON.stringify(body) }),
    put: <T>(url: string, body?: unknown) =>
        request<T>(url, { method: 'PUT', body: JSON.stringify(body) }),
    delete: <T>(url: string) => request<T>(url, { method: 'DELETE' }),
}

export async function uploadFile<T>(url: string, formData: FormData): Promise<T> {
    const csrf = readCookie('csrf_token')
    const headers: Record<string, string> = {}
    if (csrf) headers['X-CSRF-Token'] = csrf
    const res = await fetch(url, {
        credentials: 'include',
        method: 'POST',
        body: formData,
        headers,
    })
    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }))
        throw new Error(err.error ?? 'Upload failed')
    }
    return res.json()
}
