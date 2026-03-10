import { NextResponse } from "next/server"
import { unstable_cache } from "next/cache"

// Cache the API response at the route segment level for 7 days
export const revalidate = 604800

const BASE_UI_LLMS_URL = "https://base-ui.com/llms.txt"
const BASE_URL = "https://base-ui.com"

interface DocItem {
  title: string
  subtitle: string
  href: string
  example: string
}

interface BaseUIDocumentation {
  components: DocItem[]
  utilities: DocItem[]
  fetchedAt: string
}

// Parse the llms.txt content and extract components and utilities
// Format: - [Title](https://base-ui.com/react/components/button.md): Description
function parseLlmsTxt(content: string): {
  components: Array<{ title: string; mdUrl: string; href: string }>
  utilities: Array<{ title: string; mdUrl: string; href: string }>
} {
  const lines = content.split("\n")
  const components: Array<{ title: string; mdUrl: string; href: string }> = []
  const utilities: Array<{ title: string; mdUrl: string; href: string }> = []

  let inComponentsSection = false
  let inUtilitiesSection = false

  for (const line of lines) {
    // Detect section headers
    if (line.trim() === "## Components") {
      inComponentsSection = true
      inUtilitiesSection = false
      continue
    }
    if (line.trim() === "## Utilities") {
      inComponentsSection = false
      inUtilitiesSection = true
      continue
    }
    if (line.startsWith("## ")) {
      inComponentsSection = false
      inUtilitiesSection = false
      continue
    }

    if (!inComponentsSection && !inUtilitiesSection) continue

    // Parse: - [Title](https://base-ui.com/react/components/button.md): Description
    const match = line.match(/^- \[([^\]]+)\]\(([^)]+)\)/)
    if (match) {
      const title = match[1].trim()
      const mdUrl = match[2].trim()
      // Convert .md URL to the canonical web URL
      const href = mdUrl.replace(/\.md$/, "")

      if (inComponentsSection) {
        components.push({ title, mdUrl, href })
      } else if (inUtilitiesSection) {
        utilities.push({ title, mdUrl, href })
      }
    }
  }

  return { components, utilities }
}

// Extract frontmatter subtitle from a .md file
function extractSubtitle(md: string): string {
  const frontmatterMatch = md.match(/^---\n([\s\S]*?)\n---/)
  if (!frontmatterMatch) return ""
  const subtitleMatch = frontmatterMatch[1].match(/^subtitle:\s*(.+)$/m)
  return subtitleMatch ? subtitleMatch[1].trim() : ""
}

// Extract the first Tailwind tsx code block from a .md file
function extractMainExample(md: string): string {
  // Look for Tailwind section first, then fall back to the very first tsx block
  const tailwindSection = md.indexOf("### Tailwind")
  const searchFrom = tailwindSection !== -1 ? tailwindSection : 0

  const codeBlockMatch = md.slice(searchFrom).match(/```tsx\n([\s\S]*?)```/)
  if (codeBlockMatch) {
    return codeBlockMatch[1].trim()
  }

  return ""
}

// Fetch a single .md page and extract subtitle from frontmatter + the main example
async function fetchDocItem(item: {
  title: string
  mdUrl: string
  href: string
}): Promise<DocItem> {
  try {
    const response = await fetch(item.mdUrl, {
      headers: { "User-Agent": "Base-UI-Docs-Fetcher/1.0" },
    })

    if (!response.ok) {
      return { title: item.title, subtitle: "", href: item.href, example: "" }
    }

    const md = await response.text()
    const subtitle = extractSubtitle(md)
    const example = extractMainExample(md)

    return { title: item.title, subtitle, href: item.href, example }
  } catch {
    return { title: item.title, subtitle: "", href: item.href, example: "" }
  }
}

// Cache the entire documentation fetch for 7 days (604800 seconds)
const fetchBaseUIDocumentation = unstable_cache(
  async (): Promise<BaseUIDocumentation> => {
    const response = await fetch(BASE_UI_LLMS_URL, {
      headers: { "User-Agent": "Base-UI-Docs-Fetcher/1.0" },
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch llms.txt: ${response.status}`)
    }

    const content = await response.text()
    const { components: parsedComponents, utilities: parsedUtilities } = parseLlmsTxt(content)

    // Fetch all component and utility pages in parallel
    const [components, utilities] = await Promise.all([
      Promise.all(parsedComponents.map(fetchDocItem)),
      Promise.all(parsedUtilities.map(fetchDocItem)),
    ])

    return {
      components,
      utilities,
      fetchedAt: new Date().toISOString(),
    }
  },
  ["base-ui-documentation"],
  { revalidate: 604800 } // 7 days
)

export async function GET() {
  try {
    const documentation = await fetchBaseUIDocumentation()

    return NextResponse.json(documentation)
  } catch (error) {
    console.error("Error fetching Base UI documentation:", error)
    return NextResponse.json(
      { error: "Failed to fetch Base UI documentation" },
      { status: 500 }
    )
  }
}
