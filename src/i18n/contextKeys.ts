/** Machine-readable keys for context values sent to the LLM */

export const SOCIAL_KEYS = ["solo", "friends", "couple", "family"] as const;
export type SocialKey = (typeof SOCIAL_KEYS)[number];

export const BUDGET_KEYS = ["free", "budget", "standard", "luxury"] as const;
export type BudgetKey = (typeof BUDGET_KEYS)[number];

export const ENVIRONMENT_KEYS = ["indoor", "outdoor", "any_env"] as const;
export type EnvironmentKey = (typeof ENVIRONMENT_KEYS)[number];

/** i18n key paths for displaying context values */
export const SOCIAL_I18N: Record<SocialKey, string> = {
  solo: "context.social.solo",
  friends: "context.social.friends",
  couple: "context.social.couple",
  family: "context.social.family",
};

export const BUDGET_I18N: Record<BudgetKey, string> = {
  free: "context.budgetOptions.free",
  budget: "context.budgetOptions.budget",
  standard: "context.budgetOptions.standard",
  luxury: "context.budgetOptions.luxury",
};

export const ENVIRONMENT_I18N: Record<EnvironmentKey, string> = {
  indoor: "context.envOptions.indoor",
  outdoor: "context.envOptions.outdoor",
  any_env: "context.envOptions.any_env",
};
