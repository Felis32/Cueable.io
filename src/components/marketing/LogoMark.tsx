export function CueableIcon({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 861 861" fill="none">
      <path
        d="M120.54 0H740.46C807.03 0 861 53.97 861 120.54V740.46C861 807.03 807.03 861 740.46 861H120.54C53.97 861 0 807.03 0 740.46V120.54C0 53.97 53.97 0 120.54 0ZM120.54 44.77C78.69 44.77 44.77 78.69 44.77 120.54V740.46C44.77 782.31 78.69 816.23 120.54 816.23H740.46C782.31 816.23 816.23 782.31 816.23 740.46V120.54C816.23 78.69 782.31 44.77 740.46 44.77ZM704.3 202.34C704.3 229.92 681.94 252.27 654.36 252.27C626.78 252.27 604.42 229.92 604.42 202.34C604.42 174.75 626.78 152.4 654.36 152.4C681.94 152.4 704.3 174.75 704.3 202.34Z"
        fill="currentColor"
        fillRule="evenodd"
      />
    </svg>
  );
}

export function LogoMark({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex ${className}`}>
      <img src="/cueable-lockup-ink.svg" alt="Cueable" className="cueable-lockup cueable-lockup--light h-7 w-auto" />
      <img src="/cueable-lockup-dark.svg" alt="Cueable" className="cueable-lockup cueable-lockup--dark h-7 w-auto" />
    </span>
  );
}
