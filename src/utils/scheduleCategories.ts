export const normalizeCategoryName = (name: string) => name.trim().replace(/\s+/g, ' ');
export const categoryKey = (name: string) => normalizeCategoryName(name).toLowerCase();

export function mergeCategoryNames(...groups: readonly string[][]): string[] {
  const names = new Map<string, string>();
  for (const name of groups.flat()) {
    const normalized = normalizeCategoryName(name);
    if (normalized && !names.has(categoryKey(normalized))) names.set(categoryKey(normalized), normalized);
  }
  return [...names.values()];
}
