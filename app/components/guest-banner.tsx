import Link from "next/link";

/** Reminds guests that their work lives only on this browser until they create an account. */
export function GuestBanner() {
  return (
    <div className="guest-banner" role="note">
      <div className="guest-banner-inner">
        <span>You&apos;re using Journol as a guest. Your work is kept on this browser for 30 days.</span>
        <Link href="/sign-up" className="guest-banner-cta">Create a free account to keep it</Link>
      </div>
    </div>
  );
}
