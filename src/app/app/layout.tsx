import { AppShell } from "@/components/app/AppShell";

export default function ApplicationLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
