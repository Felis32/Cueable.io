import Link from "next/link";
import { PublicFrame } from "@/components/marketing/PublicFrame";
import { plans } from "@/data/pricing";

export default function PricingPage() {
  return (
    <PublicFrame>
      <h1 className="font-serif text-[40px] leading-[1.12] text-ink-2 md:text-[52px]">Simple pricing. Change it in one file.</h1>
      <p className="mt-4 max-w-[480px] text-[15px] leading-[1.5] text-muted">
        Placeholder rates until pricing is final. Edit <span className="text-ink">src/data/pricing.ts</span>.
      </p>
      <div className="mt-12 grid gap-4 lg:grid-cols-3">
        {plans.map((plan) => (
          <article key={plan.id} className={`flex flex-col rounded-[18px] border bg-surface p-6 ${plan.featured ? "border-ink" : "border-line"}`}>
            <h2 className="text-[16px] font-medium text-ink-2">{plan.name}</h2>
            <p className="mt-4 font-serif text-[40px] leading-none text-ink-2">{plan.price}</p>
            <p className="mt-2 text-[13px] text-muted">{plan.period}</p>
            <p className="mt-4 text-[14px] leading-[1.5] text-muted">{plan.description}</p>
            <ul className="mt-6 flex-1 space-y-2 text-[14px] text-ink-2">
              {plan.features.map((feature) => (
                <li key={feature}>{feature}</li>
              ))}
            </ul>
            <Link href={plan.id === "business" ? "/login" : "/signup"} className={`mt-8 inline-flex justify-center rounded-[var(--radius-pill)] px-4 py-[10px] text-[14px] font-medium ${plan.featured ? "bg-ink text-surface" : "border border-line text-ink"}`}>
              {plan.cta}
            </Link>
          </article>
        ))}
      </div>
    </PublicFrame>
  );
}
