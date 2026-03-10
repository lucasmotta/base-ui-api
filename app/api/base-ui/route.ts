import { NextResponse } from "next/server"
import { unstable_cache } from "next/cache"
import {
  type ApiSection,
  extractApiReference,
  extractSubtitle,
  extractMainExample,
} from "./parser"

// Cache the API response at the route segment level for 7 days
export const revalidate = 604800

const BASE_UI_LLMS_URL = "https://base-ui.com/llms.txt"

interface DocItem {
  title: string
  subtitle: string
  href: string
  example: string
  api: ApiSection[]
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

    const match = line.match(/^- \[([^\]]+)\]\(([^)]+)\)/)
    if (match) {
      const title = match[1].trim()
      const mdUrl = match[2].trim()
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

const HEADERS = { "User-Agent": "Base-UI-Docs-Fetcher/1.0" }

async function fetchDocItem(item: {
  title: string
  mdUrl: string
  href: string
}): Promise<DocItem> {
  const empty: DocItem = { title: item.title, subtitle: "", href: item.href, example: "", api: [] }
  try {
    const [mdRes, htmlRes] = await Promise.all([
      fetch(item.mdUrl, { headers: HEADERS }),
      fetch(item.href, { headers: HEADERS }),
    ])

    if (!mdRes.ok || !htmlRes.ok) return empty

    const [md, html] = await Promise.all([mdRes.text(), htmlRes.text()])

    return {
      title: item.title,
      subtitle: extractSubtitle(md),
      href: item.href,
      example: extractMainExample(md),
      api: extractApiReference(html),
    }
  } catch {
    return empty
  }
}

const fetchBaseUIDocumentation = unstable_cache(
  async (): Promise<BaseUIDocumentation> => {
    const response = await fetch(BASE_UI_LLMS_URL, { headers: HEADERS })
    if (!response.ok) {
      throw new Error(`Failed to fetch llms.txt: ${response.status}`)
    }

    const content = await response.text()
    const { components: parsedComponents, utilities: parsedUtilities } = parseLlmsTxt(content)

    const [components, utilities] = await Promise.all([
      Promise.all(parsedComponents.map(fetchDocItem)),
      Promise.all(parsedUtilities.map(fetchDocItem)),
    ])

    return { components, utilities, fetchedAt: new Date().toISOString() }
  },
  ["base-ui-documentation"],
  { revalidate: 604800 }
)

export async function GET() {
  try {
    const documentation = await fetchBaseUIDocumentation()
    return NextResponse.json(documentation)
  } catch (error) {
    console.error("Error fetching Base UI documentation:", error)
    return NextResponse.json({ error: "Failed to fetch Base UI documentation" }, { status: 500 })
  }
}
