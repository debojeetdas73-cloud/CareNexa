import { BadgeCheck, Building2, Clock3 } from "lucide-react";
import PharmacyVerificationDocuments from "@/components/PharmacyVerificationDocuments";
import { Info } from "@/components/pharmacy/DashboardPrimitives";

type Pharmacy = {
    id: string;
    name: string;
    phone: string | null;
    address: string;
    city: string;
    district: string;
    state: string;
    verification_status: string | null;
};

export default function PharmacyProfile({ pharmacy, verified }: { pharmacy: Pharmacy; verified: boolean }) {
    return (
        <div className="grid gap-5 lg:grid-cols-[1.1fr_.9fr]">
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex items-center gap-3">
                    <span className="grid h-12 w-12 place-items-center rounded-2xl bg-emerald-50 text-emerald-700"><Building2 /></span>
                    <div><h2 className="text-lg font-extrabold">{pharmacy.name}</h2><p className="text-sm text-slate-500">Pharmacy information</p></div>
                </div>
                <div className="mt-6 grid gap-4 sm:grid-cols-2">
                    <Info label="Phone" value={pharmacy.phone} />
                    <Info label="Address" value={pharmacy.address} />
                    <Info label="City" value={pharmacy.city} />
                    <Info label="District" value={pharmacy.district} />
                    <Info label="State" value={pharmacy.state} />
                    <Info label="Verification" value={pharmacy.verification_status || "pending"} />
                </div>
                <div className="mt-5">
                    <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-bold ${verified ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>
                        {verified ? <BadgeCheck size={16} /> : <Clock3 size={16} />} {verified ? "Verified pharmacy" : "Verification pending"}
                    </span>
                    <p className="mt-3 text-sm leading-6 text-slate-500">Your pharmacy must be reviewed by an administrator before it is listed for customers.</p>
                </div>
            </div>
            <PharmacyVerificationDocuments pharmacyId={pharmacy.id} />
        </div>
    );
}
