// Safe API Request Helpers with Robust JSON Handling

export interface ApiResponse<T = any> {
  ok: boolean;
  status: number;
  data: T | null;
  error?: string;
}

export async function safeJsonFetch<T = any>(
  url: string,
  options?: RequestInit
): Promise<ApiResponse<T>> {
  try {
    const res = await fetch(url, options);
    const contentType = res.headers.get('content-type') || '';

    let data: T | null = null;
    let errorText = '';

    if (contentType.includes('application/json')) {
      try {
        data = await res.json();
      } catch (jsonErr: any) {
        console.warn(`JSON parsing error for ${url}:`, jsonErr);
        data = null;
      }
    } else {
      errorText = await res.text();
    }

    if (!res.ok) {
      const errMsg = (data && (data as any).error) || errorText || `HTTP ${res.status}: ${res.statusText}`;
      return {
        ok: false,
        status: res.status,
        data,
        error: typeof errMsg === 'string' ? errMsg : 'Request failed',
      };
    }

    return {
      ok: true,
      status: res.status,
      data: data || ({} as T),
    };
  } catch (netErr: any) {
    console.warn(`Network / Fetch error for ${url}:`, netErr.message);
    return {
      ok: false,
      status: 0,
      data: null,
      error: netErr.message || 'Network connection error',
    };
  }
}
