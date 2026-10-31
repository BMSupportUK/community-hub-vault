export function passwordChangeInput(password: string, currentPassword: string, recovery: boolean) {
  return recovery ? { password } : { password, current_password: currentPassword };
}