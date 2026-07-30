import Link from "next/link";

export const metadata = {
  title: "Privacy Policy — Splitly",
};

export default function PrivacyPolicyPage() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 bg-background px-4 py-10">
      <div className="flex flex-col gap-1">
        <Link href="/" className="text-sm font-semibold text-foreground">
          Splitly
        </Link>
        <h1 className="text-display text-foreground">Privacy Policy</h1>
        <p className="text-caption">Effective: July 2026</p>
      </div>

      <div className="flex flex-col gap-6 text-sm leading-relaxed text-foreground">
        <p>
          Splitly (&ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;the app&rdquo;) is a bill-splitting
          tool built for use within a household. This policy explains what information we
          collect, how we use it, who we share it with, and your rights over it. It applies to
          the Splitly web app and any native wrapper of it (e.g. an Android install via Google
          Play).
        </p>

        <Section title="1. Information we collect">
          <SubHeading>Account information</SubHeading>
          <p>
            Splitly signs you in with Google only — there is no separate Splitly password. When
            you sign in, we receive your name, email address, and profile photo from your Google
            account via Firebase Authentication.
          </p>
          <SubHeading>Household &amp; bill data you create</SubHeading>
          <p>
            Household names, bill line items and prices, who was on a bill, your item
            selections/shares, and any manual entries or edits you make.
          </p>
          <SubHeading>Receipt photos — never stored</SubHeading>
          <p>
            When you upload a receipt photo, it is sent directly from your browser to our server,
            forwarded once to Google&rsquo;s Gemini API to extract the line items, and then
            discarded. We do not save receipt images to any database or file storage, before or
            after parsing.
          </p>
          <SubHeading>Splitwise data (only if you connect it)</SubHeading>
          <p>
            If you choose to connect Splitwise, we store the OAuth access token Splitwise issues,
            your Splitwise user ID, and the email associated with your Splitwise account, so we
            can push completed bill splits on your behalf. You can disconnect at any time from
            your Profile page, which deletes this immediately.
          </p>
          <SubHeading>Notification data</SubHeading>
          <p>
            If you enable push notifications, we store a device token (via Firebase Cloud
            Messaging) used only to deliver notifications about bill activity in your households.
          </p>
          <SubHeading>What we don&rsquo;t collect</SubHeading>
          <p>
            No advertising or analytics trackers, no cookies used for tracking, and no payment or
            financial account information — Splitly never processes payments or moves money (see{" "}
            <Link href="/terms" className="underline">
              Terms of Service
            </Link>
            ).
          </p>
        </Section>

        <Section title="2. How we use your information">
          <List
            items={[
              "To operate the core app — syncing households, bills, and selections in real time between household members.",
              "To send you push notifications about bill activity, if you've enabled them.",
              "To push a completed bill split to Splitwise, only if and when you choose to.",
              "We do not sell, rent, or use your personal information for advertising.",
            ]}
          />
        </Section>

        <Section title="3. Who we share it with">
          <p>We use a small number of third-party processors to run the app:</p>
          <List
            items={[
              "Google Firebase — authentication, database (Firestore), push notifications, and hosting infrastructure.",
              "Google Gemini API — receives a receipt photo in-transit, once, to parse it into line items. Not stored by us or persisted by that request beyond the parsing call itself.",
              "Splitwise — only if you connect your account, to push your completed bill split.",
            ]}
          />
          <p>We don&rsquo;t sell or rent your data to advertisers or data brokers.</p>
        </Section>

        <Section title="4. Data shared within your household">
          <p>
            Bills, items, and selections you enter are visible to the other members of the same
            household — that&rsquo;s core to how the app works. Leaving a household stops future
            visibility for you, but historical entries you made while a member remain as part of
            that household&rsquo;s shared bill record, since a bill belongs to the household, not
            to any single member. See our{" "}
            <Link href="/data-deletion" className="underline">
              Data Deletion Policy
            </Link>{" "}
            for exactly what is and isn&rsquo;t removed when you delete your account.
          </p>
        </Section>

        <Section title="5. Data retention">
          <List
            items={[
              "Bills follow each household's own retention setting (configurable by the household's creator: 1, 3, 12 months, or never) — see the app's Manage screen.",
              "Receipt photos are never retained at all; they're discarded immediately after parsing.",
              "When a bill or household is deleted, that data is permanently removed from our database — not archived or soft-deleted.",
            ]}
          />
        </Section>

        <Section title="6. Your rights &amp; account deletion">
          <p>
            You can delete your account at any time from Profile → Delete account inside the app.
            See our{" "}
            <Link href="/data-deletion" className="underline">
              Data Deletion Policy
            </Link>{" "}
            for the full detail on what gets deleted and how household ownership is handled.
          </p>
        </Section>

        <Section title="7. Data security">
          <p>
            All traffic to and from the app is encrypted (HTTPS). Access to your data is
            controlled by database security rules scoped to your household membership. We never
            store a password for you — sign-in is entirely handled by Google.
          </p>
        </Section>

        <Section title="8. Children's privacy">
          <p>
            Splitly is not directed at children, and we don&rsquo;t knowingly collect information
            from anyone under 13. If you believe a child has provided us information, contact us
            using the details below and we&rsquo;ll remove it.
          </p>
        </Section>

        <Section title="9. International users">
          <p>
            Our infrastructure runs on Google Cloud (via Firebase). By using Splitly, you
            understand your information may be processed and stored on servers outside your own
            country.
          </p>
        </Section>

        <Section title="10. Changes to this policy">
          <p>
            We may update this policy as the app changes. Material changes will update the
            &ldquo;Effective&rdquo; date at the top of this page.
          </p>
        </Section>

        <Section title="11. Contact">
          <p>
            Questions about this policy?{" "}
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

function SubHeading({ children }: { children: React.ReactNode }) {
  return <p className="mt-1 text-sm font-semibold text-foreground">{children}</p>;
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
