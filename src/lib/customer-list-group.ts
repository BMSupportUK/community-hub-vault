export type CustomerListGroup = 'single' | 'multi' | 'manual' | 'setup';

export function customerListGroup(customer: { hasSiteAccount: boolean; manualSetupPending?: boolean; accounts: unknown[]; ownerAccountCount?: number }): CustomerListGroup {
  if (customer.hasSiteAccount && customer.manualSetupPending) return 'setup';
  if (!customer.hasSiteAccount) return 'manual';
  // Hidden owner accounts show only their extra profiles, but still count every profile they own.
  const count = Math.max(customer.accounts.length, customer.ownerAccountCount ?? 0);
  return count > 1 ? 'multi' : 'single';
}
