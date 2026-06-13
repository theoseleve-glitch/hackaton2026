import Hero from "@/components/sections/Hero";
import Manifeste from "@/components/sections/Manifeste";
import SignatureMap from "@/components/sections/SignatureMap";
import HowItWorks from "@/components/sections/HowItWorks";
import DownloadCTA from "@/components/sections/DownloadCTA";

export default function Home() {
  return (
    <main id="contenu">
      <Hero />
      <Manifeste />
      <SignatureMap />
      <HowItWorks />
      <DownloadCTA />
    </main>
  );
}
