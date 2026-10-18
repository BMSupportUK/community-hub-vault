export function customerListGroup(customer: { hasSiteAccount: boolean; manualSetupPending?: boolean; accounts: unknown[] }): 'single' | 'multi' | 'manual' {
  if (!customer.hasSiteAccount || customer.manualSetupPending) return 'manual';
  return customer.accounts.length > 1 ? 'multi' : 'single';
}