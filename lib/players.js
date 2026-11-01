// Display name with a robot badge for AI players.
export function label(p) {
  if (!p) return '';
  return p.is_bot ? `🤖 ${p.name}` : p.name;
}
