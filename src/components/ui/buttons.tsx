import Link, { type LinkProps } from "next/link";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";

type Shared = {
  children: ReactNode;
  className?: string;
};

type AsButton = Shared &
  ButtonHTMLAttributes<HTMLButtonElement> & {
    href?: undefined;
  };

type AsLink = Shared &
  Omit<LinkProps, "href" | "className"> &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
    href: string;
  };

function cx(...parts: Array<string | undefined>) {
  return parts.filter(Boolean).join(" ");
}

const base =
  "inline-flex cursor-pointer items-center justify-center rounded-[var(--radius-pill)] px-5 py-[10px] text-[14px] font-medium leading-none transition-colors";

export function PrimaryPillButton(props: AsButton | AsLink) {
  const isLink = "href" in props && typeof props.href === "string";
  const className = cx(base, "bg-ink text-surface hover:bg-ink-2", props.className);

  if (isLink) {
    const { href, children, className: _className, ...rest } = props as AsLink;
    return (
      <Link href={href} className={className} {...rest}>
        {children}
      </Link>
    );
  }

  const { children, className: _className, ...rest } = props as AsButton;
  return (
    <button type="button" className={className} {...rest}>
      {children}
    </button>
  );
}

export function GhostButton(props: AsButton | AsLink) {
  const isLink = "href" in props && typeof props.href === "string";
  const className = cx(base, "border border-line bg-surface text-ink hover:bg-sidebar", props.className);

  if (isLink) {
    const { href, children, className: _className, ...rest } = props as AsLink;
    return (
      <Link href={href} className={className} {...rest}>
        {children}
      </Link>
    );
  }

  const { children, className: _className, ...rest } = props as AsButton;
  return (
    <button type="button" className={className} {...rest}>
      {children}
    </button>
  );
}

export function GoldPillButton(props: AsButton | AsLink) {
  const isLink = "href" in props && typeof props.href === "string";
  const className = cx(base, "bg-gold text-ink hover:bg-gold-hover", props.className);

  if (isLink) {
    const { href, children, className: _className, ...rest } = props as AsLink;
    return (
      <Link href={href} className={className} {...rest}>
        {children}
      </Link>
    );
  }

  const { children, className: _className, ...rest } = props as AsButton;
  return (
    <button type="button" className={className} {...rest}>
      {children}
    </button>
  );
}
