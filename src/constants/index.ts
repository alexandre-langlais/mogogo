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
  primary: "#8B5CF6",
  background: "transparent",
  surface: "rgba(30, 30, 40, 0.6)",
  text: "#FFFFFF",
  textSecondary: "#9CA3AF",
  border: "rgba(255, 255, 255, 0.1)",
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
