import Link from "next/link";

export const metadata = {
  title: "Terms of Service — Splitly",
};

export default function TermsPage() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 bg-background px-4 py-10">
      <div className="flex flex-col gap-1">
        <Link href="/" className="text-sm font-semibold text-foreground">
          Splitly
        </Link>
        <h1 className="text-display text-foreground">Terms of Service</h1>
        <p className="text-caption">Effective: July 2026</p>
      </div>

      <div className="flex flex-col gap-6 text-sm leading-relaxed text-foreground">
        <p>
          These Terms of Service (&ldquo;Terms&rdquo;) govern your use of Splitly (&ldquo;the
          app,&rdquo; &ldquo;we,&rdquo; &ldquo;us&rdquo;). By signing in or using the app, you
          agree to these Terms. If you don&rsquo;t agree, please don&rsquo;t use the app.
        </p>

        <Section title="1. What Splitly is">
          <p>
            Splitly is a household bill-splitting tool. You upload a receipt photo, it&rsquo;s
            parsed into line items using AI, household members mark what they had, and the app
            calculates each person&rsquo;s share. You can optionally push the final split to
            Splitwise.
          </p>
        </Section>

        <Section title="2. Eligibility">
          <p>
            You must be at least 13 years old to use Splitly. By using the app, you represent
            that you meet this requirement.
          </p>
        </Section>

        <Section title="3. Your account">
          <p>
            Splitly uses Google Sign-In — you don&rsquo;t create a separate password with us.
            You&rsquo;re responsible for keeping your Google account secure and for all activity
            that happens under it within the app.
          </p>
        </Section>

        <Section title="4. Households are shared spaces">
          <p>
            A household is a collaborative space. Any member, depending on their role (guest,
            admin, or creator — see the app&rsquo;s in-app permissions), can view and edit shared
            bill data in that household. You&rsquo;re responsible for what you upload and enter,
            and for who you invite into a household you create.
          </p>
        </Section>

        <Section title="5. Acceptable use">
          <p>You agree not to:</p>
          <List
            items={[
              "Use the app for anything illegal, or upload content you don't have the right to share.",
              "Attempt to disrupt, scrape, reverse-engineer, or gain unauthorized access to the app or its infrastructure.",
              "Join or access a household you weren't invited to, or misuse an invite code that isn't yours to use.",
            ]}
          />
        </Section>

        <Section title="6. Third-party services">
          <p>
            Splitly integrates with third-party services — Google&rsquo;s Gemini API (receipt
            parsing) and, optionally, Splitwise. These are independent services with their own
            terms; we&rsquo;re not responsible for their availability, accuracy, or errors,
            including AI-parsed receipt data that comes back wrong. Always double-check a
            parsed bill before confirming it.
          </p>
        </Section>

        <Section title="7. No financial services">
          <p>
            Splitly calculates and displays who owes what — it does not process payments, hold
            funds, or move money between household members. Settling up happens outside the app
            (cash, a separate payment app, or Splitwise if you&rsquo;ve connected it).
          </p>
        </Section>

        <Section title="8. Intellectual property">
          <p>
            The Splitly name, branding, and underlying code are ours. You retain rights to the
            content you upload (receipt photos, item descriptions, etc.) and grant us only the
            limited right to process it in order to provide the service to you and your
            household.
          </p>
        </Section>

        <Section title="9. Ending your use">
          <p>
            You can delete your account at any time — see our{" "}
            <Link href="/data-deletion" className="underline">
              Data Deletion Policy
            </Link>
            . We may suspend or terminate access to the app for anyone who violates these Terms.
          </p>
        </Section>

        <Section title="10. Disclaimer of warranties">
          <p>
            The app is provided &ldquo;as is&rdquo; and &ldquo;as available,&rdquo; without
            warranties of any kind, including that it will be uninterrupted, error-free, or that
            AI-parsed receipt data will be accurate.
          </p>
        </Section>

        <Section title="11. Limitation of liability">
          <p>
            To the maximum extent permitted by law, Splitly and its operators aren&rsquo;t liable
            for indirect, incidental, or consequential damages arising from your use of the app,
            including financial disputes between household members over a bill split.
          </p>
        </Section>

        <Section title="12. Governing law">
          <p>These Terms are governed by the laws of the United States.</p>
        </Section>

        <Section title="13. Changes to these Terms">
          <p>
            We may update these Terms as the app changes. Material changes will update the
            &ldquo;Effective&rdquo; date at the top of this page.
          </p>
        </Section>

        <Section title="14. Contact">
          <p>
            Questions about these Terms?{" "}
            <a href="mailto:amansaraf28@gmail.com" className="underline">
              amansaraf28@gmail.com
            </a>
          </p>
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-heading text-foreground" style={{ fontSize: "1.05rem" }}>
        {title}
      </h2>
      {children}
    </div>
  );
}

function List({ items }: { items: string[] }) {
  return (
    <ul className="flex flex-col gap-1.5 pl-5">
      {items.map((item, i) => (
        <li key={i} className="list-disc text-foreground">
          {item}
        </li>
      ))}
    </ul>
  );
}
