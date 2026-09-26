import Link from "next/link";
import { GoldPillButton } from "@/components/ui/buttons";

export function Hero() {
  return (
    <section className="mx-auto flex max-w-[760px] flex-col items-center px-4 pt-[132px] text-center md:pt-[148px]">
      <h1 className="font-serif text-[42px] leading-[1.12] tracking-[-0.02em] text-ink-2 sm:text-[56px] md:text-[64px]">
        Create professional
        <br />
        demo video &
        <br />
        docs in minutes
      </h1>
      <p className="mt-5 max-w-[520px] text-[14px] leading-[1.5] text-muted md:text-[15px]">
        Product updates, internal training, or personalized demos for clients. Cut
        raw recordings into on-brand videos and docs without living in a timeline.
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
        <GoldPillButton href="/signup" className="gap-2 px-5 py-[11px]">
          Get started
          <span aria-hidden className="text-[16px] leading-none">
            →
          </span>
        </GoldPillButton>
        <Link
          href="/login"
          className="text-[14px] font-medium text-ink hover:text-ink-2"
        >
          Book a demo
        </Link>
      </div>
      <p className="mt-4 text-[11px] font-medium tracking-[0.14em] text-muted-2">
        NO CREDIT CARD REQUIRED
      </p>
    </section>
  );
}
