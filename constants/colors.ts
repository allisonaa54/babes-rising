/**
 * Semantic design tokens for the mobile app.
 *
 * These tokens mirror the naming conventions used in web artifacts (index.css)
 * so that multi-artifact projects share a cohesive visual identity.
 *
 * Replace the placeholder values below with values that match the project's
 * brand. If a sibling web artifact exists, read its index.css and convert the
 * HSL values to hex so both artifacts use the same palette.
 *
 * To add dark mode, add a `dark` key with the same token names.
 * The useColors() hook will automatically pick it up.
 */

const colors = {
  light: {
    // Legacy aliases (kept for backward compatibility)
    text: '#2A1620',
    tint: '#E91E55',

    // Core surfaces
    background: '#FFF5FA',
    foreground: '#2A1620',

    // Cards / elevated surfaces
    card: '#FFFFFF',
    cardForeground: '#2A1620',

    // Primary action color (buttons, links, active states)
    primary: '#E91E55',
    primaryForeground: '#ffffff',

    // Secondary / less-emphasis interactive surfaces
    secondary: '#FFE1EC',
    secondaryForeground: '#7A183C',

    // Muted / subdued elements (dividers, timestamps, placeholders)
    muted: '#FFEAF1',
    mutedForeground: '#7C6670',

    // Accent highlights (badges, selected items, focus rings)
    accent: '#FFB3D0',
    accentForeground: '#A10F42',

    // Destructive actions (delete, error states)
    destructive: '#F20F2F',
    destructiveForeground: '#ffffff',

    // Borders and input outlines
    border: '#F3C9D8',
    input: '#EFB8CA',
  },

  // Border radius (in px). Sync from the sibling web artifact's --radius
  // CSS variable. This value applies to cards, buttons, inputs, and modals.
  radius: 18,
};

export default colors;
