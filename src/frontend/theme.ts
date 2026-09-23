// Paper-and-metal palette: warm eggshell surfaces, deep blue as the primary accent,
// bronze as a secondary warm accent. Single source of truth so the palette only needs
// tuning in one place.
//
// Every foreground/background pairing below is checked against WCAG 2 contrast
// minimums (4.5:1 for text, 3:1 for icons/borders/UI-component boundaries) via the
// ad hoc script this was tuned with - see conversation history if the palette needs
// re-validating after a future change.
export const colors = {
  paper: '#FAF6EA',
  paperDim: '#F5EEDA',
  paperCard: '#FFFDF6',

  ink: '#1E2A38',
  inkSoft: '#48586B',
  inkFaint: '#5C6975',
  inkTint: '#E6E9EC',

  blue: '#1F3F63',
  blueTint: '#E4EBF2',

  bronze: '#6E4419',
  bronzeTint: '#EAD9AE',

  rust: '#9A3E28',
  rustTint: '#F3DDD4',

  patina: '#3F5C41',
  patinaTint: '#E1EAE1',

  border: '#998254',
  borderStrong: '#7F6B41',
  overlay: 'rgba(30,42,56,.45)'
};

export const font = {
  display: "'Fraunces', Georgia, serif",
  sans: "'IBM Plex Sans', system-ui, -apple-system, sans-serif",
  mono: "'IBM Plex Mono', ui-monospace, 'SFMono-Regular', monospace"
};

export interface BadgeStyle {
  bg: string;
  text: string;
}

// --- hex <-> HSL, used only to derive a readable badge pair from a user-picked color ---

function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : l > 0.5 ? d / (2 - max - min) : d / (max + min);
  if (d !== 0) {
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      default:
        h = (r - g) / d + 4;
    }
    h *= 60;
  }
  return { h, s: s * 100, l: l * 100 };
}

function hue2rgb(p: number, q: number, t: number): number {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}

function hslToHex(h: number, s: number, l: number): string {
  h /= 360;
  s /= 100;
  l /= 100;
  let r: number, g: number, b: number;
  if (s === 0) {
    r = g = b = l;
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  const toHex = (x: number) =>
    Math.round(x * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

function clamp(value: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, value));
}

// Relative luminance / contrast ratio per WCAG 2 - used only to decide whether a
// user-picked color is legible enough to use as-is (see deriveBadgeStyle below).
function relativeLuminance(hex: string): number {
  const n = parseInt(hex.replace('#', ''), 16);
  const chan = (c: number) => {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const r = chan((n >> 16) & 255);
  const g = chan((n >> 8) & 255);
  const b = chan(n & 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(a: string, b: string): number {
  const l1 = relativeLuminance(a);
  const l2 = relativeLuminance(b);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

// Status/type colors are freely user-picked (a native color input + hex text field).
// The picked color is used exactly as the badge FILL - not flattened into a pale tint -
// with black or white text auto-selected, whichever contrasts better, so the badge
// actually looks like the color someone chose. If neither text option clears 4.5:1 (a
// narrow band of mid-lightness, fully-saturated colors, e.g. pure red), the fill's
// lightness is nudged in whichever direction favors the winning text color until it
// does, staying as close to the original pick as possible.
export function deriveBadgeStyle(hex: string): BadgeStyle {
  const white = contrastRatio(hex, '#FFFFFF');
  const dark = contrastRatio(hex, colors.ink);
  if (Math.max(white, dark) >= 4.5) {
    return { bg: hex, text: white >= dark ? '#FFFFFF' : colors.ink };
  }

  const { h, s, l } = hexToHsl(hex);
  const direction = white >= dark ? -1 : 1; // darken to favor white text, lighten to favor dark text
  let bg = hex;
  let bestWhite = white;
  let bestDark = dark;
  let nextL = l;
  for (let i = 0; i < 20 && Math.max(bestWhite, bestDark) < 4.5; i++) {
    nextL = clamp(nextL + direction * 4, 5, 95);
    bg = hslToHex(h, s, nextL);
    bestWhite = contrastRatio(bg, '#FFFFFF');
    bestDark = contrastRatio(bg, colors.ink);
  }
  return { bg, text: bestWhite >= bestDark ? '#FFFFFF' : colors.ink };
}

// `optionColors` comes from a repo's overseer.json (Repository Settings -> status
// colors) and maps each configured status value to a user-picked hex color. The
// built-in defaults are routed through the same derivation, so a custom and a
// default status badge share one visual language (solid fill, auto text).
export function getStatusBadgeStyle(status: string, optionColors?: Record<string, string>): BadgeStyle {
  const configured = optionColors?.[status];
  if (configured) return deriveBadgeStyle(configured);

  switch (status.toLowerCase()) {
    case 'idea':
    case 'ready':
      return deriveBadgeStyle(colors.blue);
    case 'designing':
    case 'design':
    case 'planning':
      return deriveBadgeStyle(colors.bronze);
    case 'working':
    case 'in-progress':
      return deriveBadgeStyle(colors.rust);
    case 'reviewing':
    case 'in-review':
      return deriveBadgeStyle(colors.ink);
    case 'done':
      return deriveBadgeStyle(colors.patina);
    default:
      return deriveBadgeStyle(colors.inkSoft);
  }
}

// `optionColors` comes from a repo's overseer.json (Repository Settings -> type
// colors) and maps each configured type value to a user-picked hex color.
export function getTypeBadgeStyle(type?: string, optionColors?: Record<string, string>): BadgeStyle {
  const configured = type ? optionColors?.[type] : undefined;
  if (configured) return deriveBadgeStyle(configured);

  switch (type?.toLowerCase()) {
    case 'bug':
      return deriveBadgeStyle(colors.rust);
    case 'feature':
      return deriveBadgeStyle(colors.blue);
    case 'design':
      return deriveBadgeStyle(colors.bronze);
    default:
      return deriveBadgeStyle(colors.inkSoft);
  }
}

// `optionColors` comes from a repo's overseer.json (Repository Settings -> assignee
// colors) and maps each configured assignee's full name to a user-picked hex color.
// Unlike status/type there's no sensible per-name default to switch on - an unset or
// unconfigured assignee just gets a neutral fill.
export function getAssigneeBadgeStyle(assignee?: string, optionColors?: Record<string, string>): BadgeStyle {
  const configured = assignee ? optionColors?.[assignee] : undefined;
  if (configured) return deriveBadgeStyle(configured);
  return deriveBadgeStyle(colors.inkSoft);
}

// Best-effort 1-2 char initials for the assignee circle badge, used both to seed a
// default shorthand when a name is first entered in Settings and as a rendering
// fallback for any assignee value that predates a configured shorthand (e.g. one
// hand-typed into a ticket's frontmatter before being added to Settings).
export function deriveShorthand(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

// Fields with dedicated Repository Settings UI (locked name/type, list-with-colors
// editor instead of the generic comma-separated input) - the only fields rendered as
// colored badges in the sidebar, so the only ones a color picker is relevant for.
export const BUILT_IN_ENUM_FIELDS = ['status', 'type', 'assignee'] as const;
export type BuiltInEnumField = (typeof BUILT_IN_ENUM_FIELDS)[number];

export function isBuiltInEnumField(name: string): name is BuiltInEnumField {
  return (BUILT_IN_ENUM_FIELDS as readonly string[]).includes(name.trim().toLowerCase());
}
