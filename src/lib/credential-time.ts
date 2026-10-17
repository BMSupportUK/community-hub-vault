/** Credential entry and display consistently use minute precision. */
export const CREDENTIAL_TIME_STEP = 60;

export function credentialTimeInput(value: string): string {
  return value.slice(0, 16);
}

export function formatCredentialTime(value: string | Date): string {
  return new Date(value).toLocaleString("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}