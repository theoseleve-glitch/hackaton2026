import Hero from "@/components/sections/Hero";
import Manifeste from "@/components/sections/Manifeste";
import SignatureMap from "@/components/sections/SignatureMap";
import HowItWorks from "@/components/sections/HowItWorks";
import Haltes from "@/components/sections/Haltes";
import Stats from "@/components/sections/Stats";
import DownloadCTA from "@/components/sections/DownloadCTA";

export default function Home() {
  return (
    <main id="contenu">
      <Hero />
      <Manifeste />
      <SignatureMap />
      <HowItWorks />
      <Haltes />
      <Stats />
      <DownloadCTA />
    </main>
  );
}
