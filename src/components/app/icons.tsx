export function Icon({ name, className = "h-4 w-4" }: { name: string; className?: string }) {
  const common = { className, viewBox: "0 0 16 16", fill: "none", "aria-hidden": true as const };
  switch (name) {
    case "home":
      return (
        <svg {...common}>
          <path d="M3 7.2 8 3l5 4.2V13a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7.2Z" stroke="currentColor" strokeWidth="1.3" />
        </svg>
      );
    case "spark":
      return (
        <svg {...common}>
          <path d="M8 2.2 9.1 6.2 13 7.2 9.1 8.3 8 12.3 6.9 8.3 3 7.2 6.9 6.2 8 2.2Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
        </svg>
      );
    case "library":
      return (
        <svg {...common}>
          <rect x="2.5" y="3" width="11" height="10" rx="1.4" stroke="currentColor" strokeWidth="1.3" />
          <path d="M5 6.2h6M5 8.5h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      );
    case "templates":
      return (
        <svg {...common}>
          <rect x="2.5" y="2.5" width="4.5" height="4.5" rx="1" stroke="currentColor" strokeWidth="1.3" />
          <rect x="9" y="2.5" width="4.5" height="4.5" rx="1" stroke="currentColor" strokeWidth="1.3" />
          <rect x="2.5" y="9" width="4.5" height="4.5" rx="1" stroke="currentColor" strokeWidth="1.3" />
          <rect x="9" y="9" width="4.5" height="4.5" rx="1" stroke="currentColor" strokeWidth="1.3" />
        </svg>
      );
    case "brand":
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="5" stroke="currentColor" strokeWidth="1.3" />
          <circle cx="8" cy="8" r="1.6" fill="currentColor" />
        </svg>
      );
    case "assets":
      return (
        <svg {...common}>
          <path d="M3 4.5h4l1.2 1.5H13v6.2a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
        </svg>
      );
    case "gift":
      return (
        <svg {...common}>
          <rect x="2.8" y="7" width="10.4" height="6.2" rx="1" stroke="currentColor" strokeWidth="1.3" />
          <path d="M8 7v6.2M2.8 9.2h10.4M8 7c-1.2-2.2-3.4-2.4-3.4-.6S8 7 8 7Zm0 0c1.2-2.2 3.4-2.4 3.4-.6S8 7 8 7Z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      );
    case "mic":
      return (
        <svg {...common}>
          <rect x="6" y="2.2" width="4" height="7" rx="2" stroke="currentColor" strokeWidth="1.3" />
          <path d="M4.2 8.2a3.8 3.8 0 0 0 7.6 0M8 12v1.8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      );
    case "pen":
      return (
        <svg {...common}>
          <path d="M9.2 3.2 12.8 6.8 6 13.6H2.4V10L9.2 3.2Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
        </svg>
      );
    case "link":
      return (
        <svg {...common}>
          <path d="M6.6 9.4 5.2 10.8a2.2 2.2 0 0 1-3.1-3.1L3.5 6.3M9.4 6.6l1.4-1.4a2.2 2.2 0 0 1 3.1 3.1L12.5 9.7M6.2 9.8l3.6-3.6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      );
    default:
      return null;
  }
}
