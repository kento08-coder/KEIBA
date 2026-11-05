const clientId =
  typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `client-${Date.now()}-${Math.random().toString(16).slice(2)}`

/**
 * This runtime identifier intentionally is not persisted. A duplicated tab can
 * inherit sessionStorage, so persisting it would make two editors look like the
 * same client and weaken conflict detection.
 */
export function getClientId() {
  return clientId
}
