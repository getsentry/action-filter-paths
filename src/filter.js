import picomatch from "picomatch";
import YAML from "yaml";

const MAX_CONFIG_BYTES = 64 * 1024;
const MAX_FILTERS = 256;
const MAX_PATTERNS = 4096;
const FILTER_NAME = /^[A-Za-z_][A-Za-z0-9_-]*$/;

export function parseFilters(source) {
  if (Buffer.byteLength(source, "utf8") > MAX_CONFIG_BYTES) {
    throw new Error(`filters exceeds ${MAX_CONFIG_BYTES} bytes`);
  }

  const document = YAML.parseDocument(source, { maxAliasCount: 0, schema: "core" });
  if (document.errors.length) throw document.errors[0];
  const value = document.toJS({ maxAliasCount: 0 });
  if (!value || Array.isArray(value) || typeof value !== "object") {
    throw new Error("filters must be a YAML mapping");
  }

  const entries = Object.entries(value);
  if (entries.length > MAX_FILTERS) throw new Error(`filters contains more than ${MAX_FILTERS} entries`);
  let patternCount = 0;
  return entries.map(([name, configured]) => {
    if (!FILTER_NAME.test(name) || name === "changes") {
      throw new Error(`invalid or reserved filter name: ${JSON.stringify(name)}`);
    }
    const patterns = Array.isArray(configured) ? configured : [configured];
    if (!patterns.length || patterns.some((pattern) => typeof pattern !== "string" || !pattern || pattern === "!")) {
      throw new Error(`filter ${JSON.stringify(name)} must contain non-empty string patterns`);
    }
    patternCount += patterns.length;
    if (patternCount > MAX_PATTERNS) throw new Error(`filters contains more than ${MAX_PATTERNS} patterns`);
    return { name, patterns };
  });
}

export function matchFilters(filters, paths) {
  return filters.map(({ name, patterns }) => {
    const included = patterns.filter((pattern) => !pattern.startsWith("!"));
    const excluded = patterns.filter((pattern) => pattern.startsWith("!")).map((pattern) => pattern.slice(1));
    const options = { dot: true, nonegate: true };
    const include = included.length ? picomatch(included, options) : () => true;
    const exclude = excluded.length ? picomatch(excluded, options) : () => false;
    return { name, matched: paths.some((path) => include(path) && !exclude(path)) };
  });
}
