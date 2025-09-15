// Deno 글로벌 타입 선언
declare global {
    const Deno: {
        env: {
            get(key: string): string | undefined
        }
    }

    const TextEncoder: {
        new(): TextEncoder
    }

    const TextDecoder: {
        new(): TextDecoder
    }

    const btoa: (str: string) => string
    const atob: (str: string) => string

    const crypto: {
        subtle: SubtleCrypto
    }

    const console: {
        log(...args: any[]): void
        error(...args: any[]): void
        warn(...args: any[]): void
        info(...args: any[]): void
    }

    const Response: {
        new(body?: any, init?: ResponseInit): Response
        redirect(url: string, status?: number): Response
    }

    const URL: {
        new(url: string, base?: string): URL
    }

    const Request: {
        new(input: RequestInfo, init?: RequestInit): Request
    }
}

export { }
