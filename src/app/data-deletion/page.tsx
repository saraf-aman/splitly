import Link from "next/link";

export const metadata = {
  title: "Data Deletion Policy — Splitly",
};

export default function DataDeletionPage() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 bg-background px-4 py-10">
      <div className="flex flex-col gap-1">
        <Link href="/" className="text-sm font-semibold text-foreground">
          Splitly
        </Link>
        <h1 className="text-display text-foreground">Data Deletion Policy</h1>
        <p className="text-caption">Effective: July 2026</p>
      </div>

      <div className="flex flex-col gap-6 text-sm leading-relaxed text-foreground">
        <p>
          This page describes how to delete your Splitly account and exactly what happens to
          your data when you do. It&rsquo;s a companion to our{" "}
          <Link href="/privacy" className="underline">
            Privacy Policy
          </Link>
          , kept as its own page so it&rsquo;s easy to find and link to directly.
        </p>

        <Section title="How to delete your account">
          <p>
            Sign in to Splitly, open <strong>Profile</strong> (from the menu), and select{" "}
            <strong>Delete account</strong>. You&rsquo;ll be asked to type your account email to
            confirm — this is deliberate friction for an action that can&rsquo;t be undone.
          </p>
        </Section>

        <Section title="What gets deleted immediately">
          <List
            items={[
              "Your profile (name, email, photo reference) and your Google sign-in link to the app.",
              "Your membership in every household you belong to.",
              "Your Splitwise connection, if you had one connected.",
              "Your push notification device tokens.",
            ]}
          />
          <p>
            This is a hard delete, not a deactivation — the data is permanently removed from our
            database at the moment you confirm, not archived or held for a grace period.
          </p>
        </Section>

        <Section title="If you created (own) a household">
          <p>
            If you&rsquo;re the original creator of a household, deleting your account
            doesn&rsquo;t destroy that household — ownership passes to someone else already in
            it, automatically:
          </p>
          <List
            items={[
              "If another admin is in the household, ownership transfers to whichever admin has been in the household the longest.",
              "If there's no other admin but there's at least one other member, the longest-standing member is promoted to admin and becomes the new owner.",
              "If you're the only member of that household, there's no one to hand ownership to — account deletion is blocked for that household specifically until you either add another member or delete the household yourself from its Manage screen.",
            ]}
          />
          <p>
            This transfer happens silently — the app doesn&rsquo;t ask the new owner to accept it,
            the same way an admin in Splitly can already promote or remove other members
            unilaterally.
          </p>
        </Section>

        <Section title="What is not deleted">
          <p>
            Bills, items, and selections you entered while a member of a household are shared
            data belonging to that household, not to you individually — they remain visible to
            the household&rsquo;s other members after your account is deleted, the same way they
            would if you had simply left the household. If that household is later deleted
            entirely (by its owner), that data is wiped too, per our{" "}
            <Link href="/privacy" className="underline">
              Privacy Policy
            </Link>
            .
          </p>
        </Section>

        <Section title="Questions">
          <p>
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
