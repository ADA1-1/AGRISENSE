export async function apiRequest<T>(
  path: string,
  body?: Record<string, string | number>
): Promise<T> {
  const response = await fetch(path, {
    method: body ? 'POST' : 'GET',
    credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    ...(body ? { body: JSON.stringify(body) } : {})
  });

  const responseBody = await response.text();
  let result: unknown;
  if (!responseBody.trim()) {
    throw new Error(`The server returned an empty response (HTTP ${response.status}). Check that the backend is running.`);
  }
  try {
    result = JSON.parse(responseBody);
  } catch {
    throw new Error(`The server returned an invalid response (HTTP ${response.status}). Check that the backend is running and the API URL is correct.`);
  }
  if (!response.ok) {
    const message = typeof result === 'object' && result !== null && 'message' in result
      ? String(result.message)
      : `Request failed (${response.status}).`;
    throw new Error(message);
  }
  return result as T;
}
