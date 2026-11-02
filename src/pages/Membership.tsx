import MembershipPlans from "@/components/membership/MembershipPlans";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

export default function Membership() {
  return (
    <div className="min-h-screen bg-[#f7faf8]">
      <Navbar />
      <main className="py-8">
        <MembershipPlans />
      </main>
      <Footer />
    </div>
  );
}