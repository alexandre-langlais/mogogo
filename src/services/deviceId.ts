/**
 * Web stub : pas d'identifiant device fiable sur le web.
 * Le fallback countSessions() sera utilisé à la place.
 */
export async function getDeviceId(): Promise<string | null> {
  return null;
}
