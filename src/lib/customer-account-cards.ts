/** Expand accounts only after sorting customers, so an owner's cards stay adjacent. */
export function customerAccountCards<T extends { userId: string; accounts: { id: string }[] }>(customers: T[], separate: boolean) {
  return customers.flatMap<{ customer: T; accountId: string | null; accountIndex: number | null; key: string }>((customer) => {
    if (!separate || customer.accounts.length === 0) {
      return [{ customer, accountId: null, accountIndex: null, key: customer.userId }];
    }
    return customer.accounts.map((account, accountIndex) => ({
      customer, accountId: account.id, accountIndex, key: `${customer.userId}:${account.id}`,
    }));
  });
}