import { Redirect } from "expo-router";

export default function HistoryIndexRedirect() {
  return <Redirect href="/(main)/grimoire?tab=souvenirs" />;
}
