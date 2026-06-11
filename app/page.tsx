/*
 * BIG IDEA — "Telemetry for the sponsor pitch."
 * Backed treats sponsorship-readiness the way a race engineer treats a pit-wall
 * readout: raw performance data goes in, a sponsor-ready campaign comes out. The
 * site is a motorsport sponsorship war room — every section is an instrument,
 * and the recurring motif is the before → after conversion (Word-doc + sticker
 * → sponsor-ready campaign) rendered in volt-lime telemetry on carbon.
 *
 * Archetype: Technical × Brutalist. Commerce mode: ACTIVE.
 */

import { Nav } from "@/components/sections/Nav";
import { Hero } from "@/components/sections/Hero";
import { Insight } from "@/components/sections/Insight";
import { FirstCustomer } from "@/components/sections/FirstCustomer";
import { Product } from "@/components/sections/Product";
import { ExampleKit } from "@/components/sections/ExampleKit";
import { Competitors } from "@/components/sections/Competitors";
import { Sprint } from "@/components/sections/Sprint";
import { Roadmap } from "@/components/sections/Roadmap";
import { Economics } from "@/components/sections/Economics";
import { Gtm } from "@/components/sections/Gtm";
import { Founder } from "@/components/sections/Founder";
import { Closing } from "@/components/sections/Closing";
import { Footer } from "@/components/sections/Footer";

export default function Home() {
  return (
    <>
      <Nav />
      <main id="main">
        <Hero />
        <Insight />
        <FirstCustomer />
        <Product />
        <ExampleKit />
        <Competitors />
        <Sprint />
        <Roadmap />
        <Economics />
        <Gtm />
        <Founder />
        <Closing />
      </main>
      <Footer />
    </>
  );
}
