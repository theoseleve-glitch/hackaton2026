import Hero from "@/components/sections/Hero";
import Manifeste from "@/components/sections/Manifeste";
import DownloadCTA from "@/components/sections/DownloadCTA";

export default function Home() {
  return (
    <main id="contenu">
      <Hero />
      <Manifeste />
      <DownloadCTA />
    </main>
  );
}
