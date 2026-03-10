import * as cheerio from "cheerio"

export interface ApiProp {
  prop: string
  type: string
  default: string
  description: string
}

export interface ApiSection {
  title: string
  description: string
  props: ApiProp[]
}

function decodeHtml(str: string): string {
  return str
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
}

/**
 * Parses the aria-label on a prop <summary> element.
 * Format: "Prop: NAME, type: TYPE" or "Prop: NAME, type: TYPE (default: VALUE)"
 */
export function parseSummaryLabel(label: string): ApiProp | null {
  const trimmed = label.trim()
  const typeMarker = ", type: "
  const typeIdx = trimmed.indexOf(typeMarker)
  if (!trimmed.startsWith("Prop: ") || typeIdx === -1) return null

  const prop = trimmed.slice(6, typeIdx).trim()
  const rest = trimmed.slice(typeIdx + typeMarker.length).trim()

  // Split off trailing " (default: VALUE)" if present
  const defaultMatch = rest.match(/\s+\(default: (.+)\)$/)
  const type = defaultMatch ? rest.slice(0, defaultMatch.index).trim() : rest
  const defaultVal = defaultMatch ? defaultMatch[1].trim() : "-"

  if (!prop || !type) return null

  return { prop, type: decodeHtml(type), default: decodeHtml(defaultVal) }
}

function parseSectionProps($: cheerio.CheerioAPI, section: cheerio.Element): ApiProp[] {
  const props: ApiProp[] = []
  $(section)
    .find("summary[aria-label]")
    .each((_, el) => {
      const label = $(el).attr("aria-label") ?? ""
      if (!label.startsWith("Prop:")) return
      const prop = parseSummaryLabel(label)
      if (!prop) return

      const details = $(el).closest("details")

      // When the type is "Union", look inside the <details> for the actual type
      if (prop.type === "Union") {
        const typeDt = details.find("dt").filter((_, dt) => $(dt).text().trim() === "Type")
        const unionType = typeDt.next("dd").text().trim()
        if (unionType) prop.type = unionType
      }

      const descDt = details.find("dt").filter((_, dt) => $(dt).text().trim() === "Description")
      prop.description = descDt.next("dd").text().trim()

      props.push(prop)
    })
  return props
}

/**
 * Extracts the API reference sections from the HTML of a Base UI component page.
 * Handles both single-section components (Button) and multi-section (Dialog, Accordion).
 */
export function extractApiReference(html: string): ApiSection[] {
  const $ = cheerio.load(html)
  const sections: ApiSection[] = []

  const apiH2 = $("h2").filter((_, el) => $(el).text().includes("API reference"))
  if (!apiH2.length) return []

  let currentTitle = ""
  let currentDescription = ""

  let node = apiH2.next()
  while (node.length) {
    const tagName = node.prop("tagName")?.toLowerCase()

    // Stop at the next top-level section
    if (tagName === "h2") break

    if (tagName === "h3") {
      currentTitle = node.text().trim()
      currentDescription = ""
    } else if (tagName === "p" && !currentDescription) {
      currentDescription = node.text().trim()
    } else if (tagName === "section" && node.attr("aria-describedby")?.endsWith("-caption")) {
      // Fallback: for single-section components (no h3), derive title from aria-describedby
      if (!currentTitle) {
        const describedBy = node.attr("aria-describedby") ?? ""
        currentTitle = describedBy.replace(/-caption$/, "")
      }
      sections.push({
        title: currentTitle,
        description: currentDescription,
        props: parseSectionProps($, node[0]),
      })
      currentTitle = ""
      currentDescription = ""
    }

    node = node.next()
  }

  return sections
}

export function extractSubtitle(md: string): string {
  const frontmatterMatch = md.match(/^---\n([\s\S]*?)\n---/)
  if (!frontmatterMatch) return ""
  const subtitleMatch = frontmatterMatch[1].match(/^subtitle:\s*(.+)$/m)
  return subtitleMatch ? subtitleMatch[1].trim() : ""
}

export function extractMainExample(md: string): string {
  const tailwindSection = md.indexOf("### Tailwind")
  const searchFrom = tailwindSection !== -1 ? tailwindSection : 0
  const codeBlockMatch = md.slice(searchFrom).match(/```tsx\n([\s\S]*?)```/)
  return codeBlockMatch ? codeBlockMatch[1].trim() : ""
}
