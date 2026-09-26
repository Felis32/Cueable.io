import { HeroStudio } from "@/components/marketing/HeroStudio";
import { HomeSections } from "@/components/marketing/HomeSections";
import { SiteFooter } from "@/components/marketing/SiteFooter";
import { SiteNav } from "@/components/marketing/SiteNav";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-paper">
      <SiteNav />
      <main>
        <HeroStudio />
        <HomeSections />
      </main>
      <SiteFooter />
    </div>
  );
}
