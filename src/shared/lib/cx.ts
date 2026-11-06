/** Склеивает имена CSS-классов, пропуская пустые. */
export function cx(...names: (string | false | null | undefined)[]): string {
  return names.filter(Boolean).join(' ')
}
