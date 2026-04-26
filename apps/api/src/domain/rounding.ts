/**
 * Round half to even (banker's rounding). Symmetric, zero net bias across many values.
 * @param value Real number
 * @returns Nearest integer, ties broken to the nearest even integer
 */
export function bankersRound(value: number): number {
  const rounded = Math.round(value);
  const diff = Math.abs(value - Math.trunc(value));
  if (diff !== 0.5) return rounded;
  // tie → round to even
  const floor = Math.floor(value);
  return floor % 2 === 0 ? floor : floor + 1;
}
