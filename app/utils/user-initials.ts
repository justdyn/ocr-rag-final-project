/**
 * Derive avatar initials from display name (first+last word) or email fallback.
 */
export function userInitials(input: { name: string; email: string }): string {
  let words = input.name
    .trim()
    .split(/\s+/)
    .filter((part) => part.length > 0)

  if (words.length >= 2) {
    let first = words[0]?.[0] ?? ''
    let last = words[words.length - 1]?.[0] ?? ''
    return `${first}${last}`.toUpperCase()
  }

  if (words.length === 1) {
    return (words[0]?.[0] ?? '').toUpperCase()
  }

  let email = input.email.trim()
  return email ? email[0]!.toUpperCase() : ''
}
