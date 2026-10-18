export type CustomerListGroup = 'single' | 'multi' | 'manual' | 'setup';

export function customerListGroup(customer: { hasSiteAccount: boolean; manualSetupPending?: boolean; accounts: unknown[] }): CustomerListGroup {
  if (customer.hasSiteAccount && customer.manualSetupPending) return 'setup';
  if (!customer.hasSiteAccount) return 'manual';
  return customer.accounts.length > 1 ? 'multi' : 'single';
}
