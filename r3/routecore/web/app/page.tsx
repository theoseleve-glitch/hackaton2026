import Hero from "@/components/sections/Hero";
import Manifeste from "@/components/sections/Manifeste";
import SignatureMap from "@/components/sections/SignatureMap";
import DownloadCTA from "@/components/sections/DownloadCTA";

export default function Home() {
  return (
    <main id="contenu">
      <Hero />
      <Manifeste />
      <SignatureMap />
      <DownloadCTA />
    </main>
  );
}
