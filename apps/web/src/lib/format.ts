/** Indian digit grouping, e.g. 1234567 -> ₹12,34,567 */
export function inr(n: number): string {
  const rounded = Math.round(n || 0);
  const s = String(rounded);
  let last3 = s.slice(-3);
  let rest = s.slice(0, -3);
  if (rest) last3 = ',' + last3;
  rest = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return '₹' + rest + last3;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0];
  if (!first) return 'NA';
  const second = parts[1] ? parts[1][0] : first[1];
  return (first[0] + (second ?? '')).toUpperCase();
}
