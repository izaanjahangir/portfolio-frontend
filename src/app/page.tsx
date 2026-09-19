import type { Metadata } from "next";
import { HomeScreen } from "@/screens/HomeScreen";
import { JsonLd } from "@/components/JsonLd";
import { personSchema } from "@/config/structuredData";
import { SITE } from "@/config/site";

export const metadata: Metadata = {
  // The root layout's default title already names the site, so this page
  // opts out of the "%s — Name" template to avoid repeating it.
  title: { absolute: `${SITE.name} — ${SITE.jobTitle}` },
  description: SITE.description,
  alternates: { canonical: "/" },
};

export default function HomePage() {
  return (
    <>
      <JsonLd data={personSchema()} />
      <HomeScreen />
    </>
  );
}
