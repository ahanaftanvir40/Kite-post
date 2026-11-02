import { Navbar } from "@/features/landing/components/Navbar";
import { AppModes } from "@/features/leads/components/AppModes";

export default function Dashboard() {
  return (
    <div className="flex min-h-dvh flex-col">
      <div className="bg-sheet">
        <Navbar inApp />
      </div>
      <AppModes />
    </div>
  );
}
