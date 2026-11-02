import { Hero } from "@/features/landing/components/Hero";
import { Navbar } from "@/features/landing/components/Navbar";

export default function Landing() {
  return (
    <main className="flex h-dvh min-h-[44rem] flex-col overflow-hidden bg-white">
      <Navbar />
      <Hero />
    </main>
  );
}
