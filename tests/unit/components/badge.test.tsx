import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { Badge } from "@/components/ui/badge"

describe("Badge", () => {
  it("renders children correctly", () => {
    render(<Badge>Active</Badge>)
    expect(screen.getByText("Active")).toBeInTheDocument()
  })

  it("renders with default variant classes", () => {
    const { container } = render(<Badge>Default</Badge>)
    const badge = container.firstChild as HTMLElement
    expect(badge.className).toContain("bg-primary")
    expect(badge.className).toContain("text-primary-foreground")
  })

  it("renders with success variant", () => {
    const { container } = render(<Badge variant="success">Success</Badge>)
    const badge = container.firstChild as HTMLElement
    expect(badge.className).toContain("bg-green-100")
    expect(badge.className).toContain("text-green-800")
  })

  it("renders with warning variant", () => {
    const { container } = render(<Badge variant="warning">Warning</Badge>)
    const badge = container.firstChild as HTMLElement
    expect(badge.className).toContain("bg-yellow-100")
    expect(badge.className).toContain("text-yellow-800")
  })

  it("renders with info variant", () => {
    const { container } = render(<Badge variant="info">Info</Badge>)
    const badge = container.firstChild as HTMLElement
    expect(badge.className).toContain("bg-blue-100")
    expect(badge.className).toContain("text-blue-800")
  })

  it("renders with destructive variant", () => {
    const { container } = render(<Badge variant="destructive">Error</Badge>)
    const badge = container.firstChild as HTMLElement
    expect(badge.className).toContain("bg-destructive")
  })

  it("renders with outline variant", () => {
    const { container } = render(<Badge variant="outline">Outline</Badge>)
    const badge = container.firstChild as HTMLElement
    expect(badge.className).toContain("text-foreground")
  })

  it("renders with secondary variant", () => {
    const { container } = render(<Badge variant="secondary">Secondary</Badge>)
    const badge = container.firstChild as HTMLElement
    expect(badge.className).toContain("bg-secondary")
  })

  it("merges custom className", () => {
    const { container } = render(
      <Badge className="my-custom-class">Badge</Badge>
    )
    const badge = container.firstChild as HTMLElement
    expect(badge.className).toContain("my-custom-class")
  })

  it("renders as a div by default", () => {
    const { container } = render(<Badge>Content</Badge>)
    expect(container.firstChild?.nodeName).toBe("DIV")
  })

  it("spreads additional HTML attributes", () => {
    render(<Badge data-testid="status-badge">Status</Badge>)
    expect(screen.getByTestId("status-badge")).toBeInTheDocument()
  })

  it("includes base accessibility classes (rounded, text-xs, etc.)", () => {
    const { container } = render(<Badge>Base</Badge>)
    const badge = container.firstChild as HTMLElement
    expect(badge.className).toContain("rounded-md")
    expect(badge.className).toContain("text-xs")
    expect(badge.className).toContain("font-semibold")
  })
})
