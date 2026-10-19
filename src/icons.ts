// Brand icons from simple-icons (CC0), looked up by slug.

import * as simpleIcons from "simple-icons";

export interface Icon {
  path: string; // 24×24 viewBox
  hex: string;
}

const BY_SLUG = new Map<string, Icon>();
for (const icon of Object.values(simpleIcons) as { slug?: string; path?: string; hex?: string }[]) {
  if (icon?.slug && icon.path && icon.hex) BY_SLUG.set(icon.slug, { path: icon.path, hex: `#${icon.hex}` });
}

export function getIcon(slug: string | null): Icon | null {
  return slug ? (BY_SLUG.get(slug) ?? null) : null;
}
