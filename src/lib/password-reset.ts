export function passwordChangeInput(password: string, currentPassword: string, recovery: boolean) {
  return recovery ? { password } : { password, current_password: currentPassword };
}

/** Auth's unchanged-password response confirms the customer's chosen password. */
export function passwordChoiceAccepted(error: { code?: string; message: string } | null): boolean {
  return error === null || error.code === "same_password";
}