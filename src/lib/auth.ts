import crypto from 'crypto'

function sign(value: string, secret: string) {
  return crypto.createHmac('sha256', secret).update(value).digest('hex')
}

// Token format: base64(email).HMAC — safe to split on "." since base64 and hex never contain "."
export function createToken(email: string): string {
  const secret = process.env.AUTH_SECRET ?? 'fallback-secret'
  const hmac = sign(`${email}:authenticated`, secret)
  const encodedEmail = Buffer.from(email).toString('base64')
  return `${encodedEmail}.${hmac}`
}

export function verifyToken(token: string): string | null {
  const secret = process.env.AUTH_SECRET ?? 'fallback-secret'
  const dotIndex = token.indexOf('.')
  if (dotIndex === -1) return null

  const encodedEmail = token.slice(0, dotIndex)
  const hmac = token.slice(dotIndex + 1)

  let email: string
  try {
    email = Buffer.from(encodedEmail, 'base64').toString('utf8')
    if (!email) return null
  } catch {
    return null
  }

  const expected = sign(`${email}:authenticated`, secret)
  if (!crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(expected))) return null

  return email
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.pbkdf2Sync(password, salt, 100_000, 64, 'sha512').toString('hex')
  return `pbkdf2:${salt}:${hash}`
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split(':')
  if (parts.length !== 3 || parts[0] !== 'pbkdf2') return false
  const [, salt, hash] = parts
  try {
    const derived = crypto.pbkdf2Sync(password, salt, 100_000, 64, 'sha512').toString('hex')
    if (derived.length !== hash.length) return false
    return crypto.timingSafeEqual(Buffer.from(derived, 'hex'), Buffer.from(hash, 'hex'))
  } catch {
    return false
  }
}
