import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

const Index = lazy(() => import("./pages/Index.tsx"));
const PharmacyDetail = lazy(() => import("./pages/PharmacyDetail.tsx"));
const Hospitals = lazy(() => import("./pages/Hospitals.tsx"));
const HospitalDetail = lazy(() => import("./pages/HospitalDetail.tsx"));
const DoctorProfile = lazy(() => import("./pages/DoctorProfile.tsx"));
const HospitalPackageDetail = lazy(() => import("./pages/HospitalPackageDetail.tsx"));
const NotFound = lazy(() => import("./pages/NotFound.tsx"));
const Account = lazy(() => import("./pages/Account.tsx"));
const CustomerProfile = lazy(() => import("./pages/customer/CustomerProfile.tsx"));
const PharmacyDashboard = lazy(() => import("./pages/PharmacyDashboard.tsx"));
const AdminDashboard = lazy(() => import("./pages/AdminDashboard.tsx"));
const PharmacyOnboarding = lazy(() => import("./pages/PharmacyOnboarding.tsx"));

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Suspense fallback={<div role="status" className="grid min-h-screen place-items-center text-sm text-slate-500">Loading page…</div>}>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/pharmacy/:id" element={<PharmacyDetail />} />
            <Route path="/hospitals" element={<Hospitals />} />
            <Route path="/hospitals/:id" element={<HospitalDetail />} />
            <Route path="/hospitals/:hospitalId/doctors/:doctorId" element={<DoctorProfile />} />
            <Route path="/hospitals/:hospitalId/packages/:packageId" element={<HospitalPackageDetail />} />
            <Route path="/account" element={<Account />} />
            <Route path="/profile" element={<CustomerProfile />} />
            <Route path="/pharmacy-onboarding" element={<PharmacyOnboarding />} />
            <Route path="/pharmacy-dashboard" element={<PharmacyDashboard />} />
            <Route path="/pharmacy-dashboard/inventory/:section" element={<PharmacyDashboard />} />
            <Route path="/pharmacy-dashboard/distributors" element={<PharmacyDashboard />} />
            <Route path="/admin" element={<AdminDashboard />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
