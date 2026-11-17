import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BrandLogo } from "@/components/brand-mark";
import { DEFAULT_BRANDING } from "@/lib/branding";

describe("marca del cascarón", () => {
  it("muestra la marca Wachato predeterminada con su isotipo", () => {
    const html = renderToStaticMarkup(createElement(BrandLogo, { branding: DEFAULT_BRANDING }));
    expect(html).toContain('aria-label="Wachato"');
    expect(html).toContain("wachat");
    expect(html).toContain('viewBox="0 0 100 100"');
  });

  it.each(["Mi negocio", "Wachato"])("respeta el logo personalizado de %s", (name) => {
    const branding = { ...DEFAULT_BRANDING, name, favicon: { mime: "image/png", version: 1 } };
    const html = renderToStaticMarkup(createElement(BrandLogo, { branding }));
    expect(html).toContain(name);
    expect(html).toContain("<img");
    expect(html).not.toContain('viewBox="0 0 100 100"');
  });
});
