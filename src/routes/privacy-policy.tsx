import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/privacy-policy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy | BM Support" },
      {
        name: "description",
        content:
          "How BM Support collects, uses and protects your personal information, including account details, payments, cookies and advertising.",
      },
      { property: "og:title", content: "Privacy Policy | BM Support" },
      {
        property: "og:description",
        content:
          "How BM Support collects, uses and protects your personal information, including account details, payments, cookies and advertising.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://bmsupport.uk/privacy-policy" },
    ],
    links: [{ rel: "canonical", href: "https://bmsupport.uk/privacy-policy" }],
  }),
  component: PrivacyPolicyPage,
});

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold text-red-100">{title}</h2>
      <div className="space-y-2 text-sm leading-relaxed text-red-50/80">{children}</div>
    </section>
  );
}

function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-[#1a0505] to-black text-red-50">
      <div className="mx-auto max-w-3xl px-6 py-12 space-y-8">
        <div>
          <Link to="/" className="text-sm text-red-300/80 hover:text-red-200 underline underline-offset-4">
            ← Back to BM Support
          </Link>
          <h1 className="mt-4 text-3xl font-bold text-red-50">Privacy Policy</h1>
          <p className="mt-1 text-sm text-red-100/60">Last updated: 26 September 2026</p>
        </div>

        <Section title="Who we are">
          <p>
            BM Support ("we", "us") operates the customer portal and community app at bmsupport.uk. This policy
            explains what information we collect when you use our website and app, and how we use it.
          </p>
        </Section>

        <Section title="Information we collect">
          <ul className="list-disc pl-5 space-y-1">
            <li>Account details you give us when signing up, such as your name, email address and username.</li>
            <li>Content you post in the community, support tickets and messages you send us.</li>
            <li>Order and payment information when you buy a package. Card payments are processed by our payment providers (Stripe and Square); we never see or store your full card number.</li>
            <li>Technical information such as your IP address, device type and how you use the app, used to keep the service secure and working properly.</li>
          </ul>
        </Section>

        <Section title="How we use your information">
          <ul className="list-disc pl-5 space-y-1">
            <li>To provide your account, process orders and deliver the services you buy.</li>
            <li>To respond to support tickets and messages.</li>
            <li>To keep the community safe, enforce our rules and prevent fraud and abuse.</li>
            <li>To send service-related notices (for example about your order or account). We do not sell your personal information.</li>
          </ul>
        </Section>

        <Section title="Cookies and advertising">
          <p>
            We use cookies and similar technologies to keep you signed in and to remember your preferences. We also
            show advertising provided by Google AdSense. Google and its partners may use cookies to serve ads based on
            your visits to this and other websites.
          </p>
          <p>
            You can opt out of personalised advertising by visiting{" "}
            <a
              href="https://www.google.com/settings/ads"
              target="_blank"
              rel="noopener noreferrer"
              className="text-red-300 underline underline-offset-4 hover:text-red-200"
            >
              Google Ads Settings
            </a>
            . For more information on how Google uses data, see{" "}
            <a
              href="https://policies.google.com/technologies/partner-sites"
              target="_blank"
              rel="noopener noreferrer"
              className="text-red-300 underline underline-offset-4 hover:text-red-200"
            >
              Google's Privacy &amp; Terms
            </a>
            .
          </p>
        </Section>

        <Section title="Who we share information with">
          <p>
            We share information only with the providers that help us run the service — our hosting and database
            provider, payment processors (Stripe, Square) and our advertising partner (Google). These providers may
            only use your information to provide their service to us.
          </p>
        </Section>

        <Section title="How long we keep information">
          <p>
            We keep your account information while your account is active. Support tickets, orders and community
            content are kept for as long as needed to run the service and meet legal or accounting requirements. You
            can ask us to delete your account at any time.
          </p>
        </Section>

        <Section title="Your rights">
          <p>
            Under UK data protection law you have the right to access, correct or delete your personal information,
            and to object to or restrict how we use it. To exercise any of these rights, contact us through a support
            ticket in the app or via the contact page.
          </p>
        </Section>

        <Section title="Security">
          <p>
            We use encryption in transit, access controls and staff PIN protection to keep your information safe. No
            method of transmission over the internet is completely secure, but we work to protect your information
            and will tell you if a breach affects you.
          </p>
        </Section>

        <Section title="Changes to this policy">
          <p>
            If we change this policy we will update the date at the top of this page. Significant changes will be
            announced in the app.
          </p>
        </Section>

        <Section title="Contact">
          <p>
            Questions about this policy? Open a support ticket in the app or visit our{" "}
            <Link to="/contact" className="text-red-300 underline underline-offset-4 hover:text-red-200">
              contact page
            </Link>
            .
          </p>
        </Section>
      </div>
    </div>
  );
}
