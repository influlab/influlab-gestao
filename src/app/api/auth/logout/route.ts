export async function POST() {
  const headers = new Headers({ 'Content-Type': 'application/json' })
  headers.append('Set-Cookie', 'auth_token=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0')
  headers.append('Set-Cookie', 'user_role=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0')
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers })
}
