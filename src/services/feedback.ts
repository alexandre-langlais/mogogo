import { Platform } from "react-native";
import Constants from "expo-constants";
import { supabase } from "./supabase";

export type FeedbackCategory = "feature" | "bug" | "content" | "other";

const VALID_CATEGORIES: FeedbackCategory[] = ["feature", "bug", "content", "other"];
const FEEDBACK_MAX_LENGTH = 2000;

interface SubmitFeedbackParams {
  category: FeedbackCategory;
  message: string;
}

function getDeviceInfo(): Record<string, unknown> {
  return {
    os: Platform.OS,
    osVersion: Platform.Version,
    appVersion: Constants.expoConfig?.version ?? "unknown",
  };
}

/**
 * Soumet un feedback utilisateur.
 * Valide côté client puis INSERT dans app_feedback via Supabase.
 */
export async function submitFeedback({ category, message }: SubmitFeedbackParams): Promise<void> {
  // Auth check
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("User must be authenticated");

  // Validate category
  if (!VALID_CATEGORIES.includes(category)) {
    throw new Error(`Invalid category: ${category}`);
  }

  // Trim + validate message
  const trimmed = message.trim();
  if (trimmed.length === 0) {
    throw new Error("Message must not be empty");
  }
  if (trimmed.length > FEEDBACK_MAX_LENGTH) {
    throw new Error(`Message too long: ${trimmed.length} chars (max ${FEEDBACK_MAX_LENGTH})`);
  }

  const { error } = await supabase.from("app_feedback").insert({
    user_id: user.id,
    category,
    message: trimmed,
    device_info: getDeviceInfo(),
  });

  if (error) throw error;
}
