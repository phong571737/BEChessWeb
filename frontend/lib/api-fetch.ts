
// This function wraps the native fetch API to include the Authorization header with the token from localStorage.
export async function apiFetch(
    input: RequestInfo | URL,
    init: RequestInit = {}
): Promise<Response> {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    const headers = new Headers(init.headers);
    if (token) {
        headers.set("Authorization", `Bearer ${token}`);
    }
    const response = await fetch(input, {
        ...init,
        headers,
    });
    
    // If the response status is 401 (Unauthorized), dispatch a custom event to handle authentication expiration
    if (response.status === 401 && typeof window !== "undefined") {
        window.dispatchEvent(new Event("auth:expired"));
    }

    return response;
}