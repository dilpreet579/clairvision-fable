import HomePageClient from "@/components/public/HomePageClient";

// Since layout.tsx sets the template "%s | ClairVision" and default "ClairVision",
// we don't strictly need to override title here unless we want something specific,
// but adding it makes the intent clear.
export const metadata = {
  title: "Find yourself in the photos",
  description: "Search any published event by face — no account, no sign-in.",
};

export default function HomePage() {
  return <HomePageClient />;
}

