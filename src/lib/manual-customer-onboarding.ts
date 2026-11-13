import { z } from 'zod';

export const manualCustomerInput = z.object({
  name: z.string().trim().min(1, 'Enter the customer name.').max(100),
  email: z.string().trim().toLowerCase().email().max(255).optional().or(z.literal('')),
});

/** Contact records are not website accounts and never trigger invitation emails. */
export async function saveManualCustomer(admin: any, callerId: string, input: unknown) {
  const data = manualCustomerInput.parse(input);
  const { data: row, error } = await admin.from('manual_name_customers')
    .insert({ name: data.name, email: data.email || null, created_by: callerId }).select('id').single();
  if (error || !row) throw new Error('The customer could not be added. Please try again.');
  return { userId: row.id, sent: false, banned: false, nameOnly: true };
}