import { searchQuery } from "../utils/prompts"
import { info, error } from "../utils/output"

export interface FindOptions {
  query?: string
}

export async function findCommand(
  query: string | undefined,
  options: FindOptions
): Promise<void> {
  try {
    const searchTerm = query || options.query || (await searchQuery())

    if (!searchTerm) {
      info("No search query provided")
      return
    }

    // TODO: Implement registry search or GitHub search
    // For now, just show a message
    info(`Searching for agents matching "${searchTerm}"...`)
    info(
      "Registry search not yet implemented. Please use GitHub URLs directly."
    )
    info("Example: npx agntx add owner/repo")
  } catch (err) {
    error(err instanceof Error ? err.message : String(err))
    process.exit(1)
  }
}
