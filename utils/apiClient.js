// Simple API client for calling backend endpoints
export async function signupUser(data) {
  const res = await fetch('/api/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Signup failed');
  }
  return res.json();
}
