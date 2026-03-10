import { describe, it, expect } from "vitest"
import { parseSummaryLabel, extractApiReference } from "../app/api/base-ui/parser"

// ─── parseSummaryLabel ────────────────────────────────────────────────────────

describe("parseSummaryLabel", () => {
  it("parses a simple boolean prop with default", () => {
    expect(parseSummaryLabel("Prop: defaultOpen, type: boolean (default: false)")).toEqual({
      prop: "defaultOpen",
      type: "boolean",
      default: "false",
    })
  })

  it("parses a prop without a default (trailing space, no default marker)", () => {
    expect(parseSummaryLabel("Prop: open, type: boolean ")).toEqual({
      prop: "open",
      type: "boolean",
      default: "-",
    })
  })

  it("parses a function type shown as 'function'", () => {
    expect(parseSummaryLabel("Prop: onOpenChange, type: function ")).toEqual({
      prop: "onOpenChange",
      type: "function",
      default: "-",
    })
  })

  it("parses a union type with a string literal default", () => {
    expect(
      parseSummaryLabel("Prop: modal, type: boolean | &#x27;trap-focus&#x27; (default: true)")
    ).toEqual({
      prop: "modal",
      type: "boolean | 'trap-focus'",
      default: "true",
    })
  })

  it("decodes HTML entities in generic types", () => {
    expect(
      parseSummaryLabel("Prop: actionsRef, type: RefObject&lt;Dialog.Root.Actions | null&gt; ")
    ).toEqual({
      prop: "actionsRef",
      type: "RefObject<Dialog.Root.Actions | null>",
      default: "-",
    })
  })

  it("parses union type with function", () => {
    expect(parseSummaryLabel("Prop: className, type: string | function ")).toEqual({
      prop: "className",
      type: "string | function",
      default: "-",
    })
  })

  it("parses an ARIA prop with hyphen in name", () => {
    expect(parseSummaryLabel("Prop: aria-valuetext, type: string (default: -)")).toEqual({
      prop: "aria-valuetext",
      type: "string",
      default: "-",
    })
  })

  it("parses a complex generic type with nested angle brackets", () => {
    expect(
      parseSummaryLabel(
        "Prop: ref, type: RefObject&lt;HTMLButtonElement | null&gt; (default: -)"
      )
    ).toEqual({
      prop: "ref",
      type: "RefObject<HTMLButtonElement | null>",
      default: "-",
    })
  })

  it("returns null for non-prop labels", () => {
    expect(parseSummaryLabel("Some other label")).toBeNull()
    expect(parseSummaryLabel("")).toBeNull()
  })

  it("parses undefined as the default value", () => {
    expect(parseSummaryLabel("Prop: name, type: string (default: undefined)")).toEqual({
      prop: "name",
      type: "string",
      default: "undefined",
    })
  })
})

// ─── extractApiReference ─────────────────────────────────────────────────────

function makeHtml(apiBody: string) {
  return `<html><body><main>
    <h1>Some Component</h1>
    <p>Intro text</p>
    ${apiBody}
    <h2>Other section</h2>
  </main></body></html>`
}

function makePropSummary(prop: string, type: string, defaultVal?: string) {
  const defaultPart = defaultVal !== undefined ? ` (default: ${defaultVal})` : ""
  return `<details class="AccordionItem">
    <summary aria-label="Prop: ${prop}, type: ${type}${defaultPart}"></summary>
  </details>`
}

function makeUnionPropSummary(prop: string, unionType: string, defaultVal?: string) {
  const defaultPart = defaultVal !== undefined ? ` (default: ${defaultVal})` : ""
  return `<details class="AccordionItem">
    <summary aria-label="Prop: ${prop}, type: Union${defaultPart}"></summary>
    <dl>
      <dt>Type</dt>
      <dd>${unionType}</dd>
    </dl>
  </details>`
}

function makeSection(sectionId: string, ...props: string[]) {
  return `<section aria-describedby="${sectionId}-caption">
    ${props.join("\n")}
  </section>`
}

describe("extractApiReference", () => {
  it("returns empty array when there is no API reference section", () => {
    const html = makeHtml("<h2>Other section</h2>")
    expect(extractApiReference(html)).toEqual([])
  })

  it("parses a single-section component (no h3, title from aria-describedby)", () => {
    const html = makeHtml(`
      <h2>API reference</h2>
      ${makeSection(
        "Button",
        makePropSummary("focusableWhenDisabled", "boolean", "false"),
        makePropSummary("nativeButton", "boolean", "true"),
        makePropSummary("className", "string | function")
      )}
    `)
    const api = extractApiReference(html)
    expect(api).toHaveLength(1)
    expect(api[0].title).toBe("Button")
    expect(api[0].props).toHaveLength(3)
    expect(api[0].props[0]).toEqual({ prop: "focusableWhenDisabled", type: "boolean", default: "false" })
    expect(api[0].props[2]).toEqual({ prop: "className", type: "string | function", default: "-" })
  })

  it("parses a multi-section component (with h3s)", () => {
    const html = makeHtml(`
      <h2>API reference</h2>
      <h3>Root</h3>
      <p>Groups all parts of the dialog.</p>
      ${makeSection(
        "DialogRoot",
        makePropSummary("defaultOpen", "boolean", "false"),
        makePropSummary("open", "boolean")
      )}
      <h3>Trigger</h3>
      ${makeSection(
        "DialogTrigger",
        makePropSummary("nativeButton", "boolean", "true")
      )}
    `)
    const api = extractApiReference(html)
    expect(api).toHaveLength(2)
    expect(api[0].title).toBe("Root")
    expect(api[0].description).toBe("Groups all parts of the dialog.")
    expect(api[0].props).toHaveLength(2)
    expect(api[1].title).toBe("Trigger")
    expect(api[1].props).toHaveLength(1)
  })

  it("captures the description paragraph for each section", () => {
    const html = makeHtml(`
      <h2>API reference</h2>
      <h3>Root</h3>
      <p>Represents the checkbox itself.</p>
      ${makeSection("CheckboxRoot", makePropSummary("checked", "boolean", "false"))}
    `)
    const api = extractApiReference(html)
    expect(api[0].description).toBe("Represents the checkbox itself.")
  })

  it("stops parsing at the next h2", () => {
    const html = makeHtml(`
      <h2>API reference</h2>
      <h3>Root</h3>
      ${makeSection("Root", makePropSummary("disabled", "boolean", "false"))}
      <h2>Changelog</h2>
      <h3>Should not be parsed</h3>
      ${makeSection("Fake", makePropSummary("shouldNotAppear", "boolean"))}
    `)
    const api = extractApiReference(html)
    expect(api).toHaveLength(1)
    expect(api[0].props.every((p) => p.prop !== "shouldNotAppear")).toBe(true)
  })

  it("skips non-prop summary elements (no 'Prop:' prefix)", () => {
    const html = makeHtml(`
      <h2>API reference</h2>
      ${makeSection(
        "Button",
        `<details><summary aria-label="Data attribute: data-disabled"></summary></details>`,
        makePropSummary("disabled", "boolean", "false")
      )}
    `)
    const api = extractApiReference(html)
    expect(api[0].props).toHaveLength(1)
    expect(api[0].props[0].prop).toBe("disabled")
  })

  it("decodes HTML entities in prop types", () => {
    const html = makeHtml(`
      <h2>API reference</h2>
      <h3>Root</h3>
      ${makeSection(
        "DialogRoot",
        makePropSummary("actionsRef", "RefObject&lt;Actions | null&gt;")
      )}
    `)
    const api = extractApiReference(html)
    expect(api[0].props[0].type).toBe("RefObject<Actions | null>")
  })

  it("resolves Union type from expanded <details> Type dt", () => {
    const html = makeHtml(`
      <h2>API reference</h2>
      ${makeSection(
        "Combobox",
        makeUnionPropSummary("value", "string | number | string[]"),
        makePropSummary("disabled", "boolean", "false")
      )}
    `)
    const api = extractApiReference(html)
    expect(api[0].props[0]).toEqual({ prop: "value", type: "string | number | string[]", default: "-" })
    expect(api[0].props[1]).toEqual({ prop: "disabled", type: "boolean", default: "false" })
  })

  it("handles multiple sections with no description paragraphs", () => {
    const html = makeHtml(`
      <h2>API reference</h2>
      <h3>Portal</h3>
      ${makeSection("Portal", makePropSummary("container", "HTMLElement | null"))}
      <h3>Backdrop</h3>
      ${makeSection("Backdrop", makePropSummary("forceRender", "boolean", "false"))}
    `)
    const api = extractApiReference(html)
    expect(api).toHaveLength(2)
    expect(api[0].description).toBe("")
    expect(api[1].description).toBe("")
  })
})

// ─── Integration: real pages ──────────────────────────────────────────────────

describe("extractApiReference (live)", { timeout: 20000 }, () => {
  async function fetchHtml(url: string) {
    const res = await fetch(url, { headers: { "User-Agent": "test" } })
    return res.text()
  }

  it("parses Dialog — multi-section, no spurious props", async () => {
    const html = await fetchHtml("https://base-ui.com/react/components/dialog")
    const api = extractApiReference(html)
    const titles = api.map((s) => s.title)
    expect(titles).toContain("Root")
    expect(titles).toContain("Trigger")
    expect(titles).toContain("Close")
    // No garbage prop names
    const allProps = api.flatMap((s) => s.props)
    expect(allProps.every((p) => /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(p.prop))).toBe(true)
    expect(allProps.every((p) => p.type.length > 0)).toBe(true)
    // defaultOpen should exist on Root with default: false
    const root = api.find((s) => s.title === "Root")!
    const defaultOpen = root.props.find((p) => p.prop === "defaultOpen")!
    expect(defaultOpen.default).toBe("false")
  })

  it("parses Button — single-section, all props valid", async () => {
    const html = await fetchHtml("https://base-ui.com/react/components/button")
    const api = extractApiReference(html)
    expect(api).toHaveLength(1)
    expect(api[0].props.length).toBeGreaterThan(0)
    const allProps = api[0].props
    expect(allProps.every((p) => /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(p.prop))).toBe(true)
  })

  it("parses Meter — includes aria-valuetext prop", async () => {
    const html = await fetchHtml("https://base-ui.com/react/components/meter")
    const api = extractApiReference(html)
    const allProps = api.flatMap((s) => s.props)
    const ariaProps = allProps.filter((p) => p.prop.startsWith("aria-"))
    expect(ariaProps.length).toBeGreaterThan(0)
  })
})
