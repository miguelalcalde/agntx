import * as fs from "fs"
import * as path from "path"
import matter from "gray-matter"

export interface AgentFile {
  path: string // relative path in repo
  sourceRoot?: string // selected source root in repo
  installPath?: string // relative path under selected source root
  name: string // from frontmatter or filename
  description?: string
  model?: string
  readonly?: boolean
  is_background?: boolean
  content: string // full file content
}

/**
 * Try to extract simple key-value pairs from a frontmatter block whose YAML
 * is too complex for the default parser (e.g. unquoted colons in values).
 * Only handles flat `key: value` lines – good enough for the fields we care
 * about (name, description, model, …).
 */
function parseFrontmatterLoose(
  raw: string
): Record<string, string> | null {
  const fmMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!fmMatch) return null

  const result: Record<string, string> = {}
  for (const line of fmMatch[1].split(/\r?\n/)) {
    const kvMatch = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*(.*)$/)
    if (kvMatch) {
      result[kvMatch[1]] = kvMatch[2].trim()
    }
  }
  return result
}

export function parseAgentFile(filePath: string): AgentFile | null {
  try {
    const content = fs.readFileSync(filePath, "utf-8")

    let data: Record<string, unknown> | null = null

    // First try the strict gray-matter parser.
    try {
      const parsed = matter(content)
      if (parsed.data && typeof parsed.data === "object") {
        data = parsed.data as Record<string, unknown>
      }
    } catch {
      // YAML parsing can fail on frontmatter with unquoted special chars
      // (e.g. colons inside description values).  Fall back to a lenient
      // regex-based extractor so we don't silently drop valid agent files.
      const loose = parseFrontmatterLoose(content)
      if (loose) {
        data = loose
      }
    }

    // Accept .md files even without frontmatter – derive name from filename.
    const name = (data?.name as string) || path.basename(filePath, ".md")

    // Validate name: lowercase letters, digits, hyphens, and underscores
    if (!/^[a-z0-9_-]+$/.test(name)) {
      return null
    }

    return {
      path: filePath,
      name,
      description: data?.description as string | undefined,
      model: (data?.model as string) || "inherit",
      readonly: Boolean(data?.readonly) || false,
      is_background: Boolean(data?.is_background) || false,
      content,
    }
  } catch (error) {
    // Filesystem errors (permission, missing file, etc.)
    return null
  }
}
