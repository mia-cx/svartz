/**
 * `value` as stable text for a cache key: functions by their source, Maps, Sets and RegExps by their contents, and an
 * object seen before by a marker, so plugin objects that point at themselves still serialize. Build caches hash it to
 * tell whether what a compile reads has changed.
 */
export function describeValue(value: unknown): string {
  const seen = new WeakSet<object>();
  return JSON.stringify(value, (_key, item: unknown) => {
    if (typeof item === "function") return `ƒ ${String(item)}`;
    if (typeof item === "bigint" || typeof item === "symbol") return String(item);
    if (item instanceof RegExp) return `${item}`;
    if (item instanceof Map) return { map: [...item] };
    if (item instanceof Set) return { set: [...item] };
    if (item && typeof item === "object") {
      if (seen.has(item)) return "[seen]";
      seen.add(item);
    }
    return item;
  }) ?? "undefined";
}
