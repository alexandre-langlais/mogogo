export type ThemeColors = {
  primary: string;
  background: string;
  surface: string;
  text: string;
  textSecondary: string;
  border: string;
  white: string;
  black: string;
};

export const LIGHT_COLORS: ThemeColors = {
  primary: "#6C3FC5",
  background: "#FFFFFF",
  surface: "#F5F0FF",
  text: "#333333",
  textSecondary: "#666666",
  border: "#DDDDDD",
  white: "#FFFFFF",
  black: "#000000",
};

export const DARK_COLORS: ThemeColors = {
  primary: "#9B7ADB",
  background: "#121212",
  surface: "#1E1A2E",
  text: "#E8E8E8",
  textSecondary: "#A0A0A0",
  border: "#333333",
  white: "#FFFFFF",
  black: "#000000",
};

/** @deprecated Use useTheme().colors instead */
export const COLORS = LIGHT_COLORS;

export const SEARCH_RADIUS = {
  initial: 5000,
  expanded: 15000,
} as const;

export const SEARCH_RADIUS_RANGE = {
  min: 2000,
  max: 30000,
  default: 10000,
} as const;

export const PLACES_MIN_RATING = 4.0;
