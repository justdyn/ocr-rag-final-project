/** SVG ring math — dashoffset = circumference * (1 - fraction). */
export function circularProgressStroke(
  fraction: number,
  radius: number,
): { circumference: number; dashoffset: number } {
  let circumference = 2 * Math.PI * radius
  let clamped = Math.min(1, Math.max(0, fraction))
  return { circumference, dashoffset: circumference * (1 - clamped) }
}
