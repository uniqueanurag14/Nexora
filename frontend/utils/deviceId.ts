/**
 * Privacy-conscious persistent browser device identifier helper.
 * Generates a random UUID stored in localStorage — never attempts to fabricate
 * OS hostnames or hardware MAC addresses.
 */

const STORAGE_KEY = 'nexora_device_id';

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `dev_${crypto.randomUUID().replace(/-/g, '')}`;
  }
  const rand = Math.random().toString(36).slice(2) + Date.now().toString(36);
  return `dev_${rand.slice(0, 28)}`;
}

export function getClientDeviceId(): string {
  if (typeof window === 'undefined') return 'dev_ssr_client';
  try {
    let id = window.localStorage.getItem(STORAGE_KEY);
    if (!id || !/^[A-Za-z0-9_\-:.]{8,128}$/.test(id)) {
      id = generateId();
      window.localStorage.setItem(STORAGE_KEY, id);
    }
    return id;
  } catch {
    return generateId();
  }
}
