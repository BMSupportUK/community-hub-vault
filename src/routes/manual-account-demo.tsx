import { createFileRoute } from '@tanstack/react-router';
import { ManualAccountCreation } from '@/components/checkout/ManualAccountCreation';
export const Route = createFileRoute('/manual-account-demo')({
  head: () => ({ meta: [
    { title: 'Account creation demo — BM Support' },
    { name: 'description', content: 'Preview the final manual-order account creation page without saving customer data.' },
    { property: 'og:title', content: 'Account creation demo — BM Support' },
    { property: 'og:description', content: 'Preview the final manual-order account creation page without saving customer data.' },
    { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary_large_image' },
    { name: 'robots', content: 'noindex, nofollow' },
  ] }),
  component: () => <ManualAccountCreation demo />,
});