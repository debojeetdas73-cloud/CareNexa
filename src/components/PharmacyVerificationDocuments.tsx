import { useCallback, useEffect, useState } from "react";
import { requireSupabase } from "@/lib/supabase";

type DocumentType = "aadhaar" | "pharmacy_license" | "owner_photo" | "shop_photo";
type VerificationDocument = {
    id: string;
    document_type: DocumentType;
    review_status: string;
    reviewer_note: string | null;
    created_at: string;
};

const DOCUMENTS: Array<{ type: DocumentType; label: string }> = [
    { type: "aadhaar", label: "Owner identity document" },
    { type: "pharmacy_license", label: "Pharmacy licence" },
    { type: "owner_photo", label: "Owner photo" },
    { type: "shop_photo", label: "Shop photo" },
];

const acceptedTypes = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const displayStatus = (status: string) => status.replace(/_/g, " ");
const configuredProjectHost = () => {
    const url = import.meta.env.VITE_SUPABASE_URL;
    if (!url) return "unknown project";
    try {
        return new URL(url).host;
    } catch {
        return "unknown project";
    }
};
const errorMessage = (error: unknown) => {
    if (error instanceof Error) return error.message;
    if (typeof error === "object" && error !== null) {
        const details = error as Record<string, unknown>;
        if (typeof details.message === "string") return details.message;
    }
    return "Could not upload verification document.";
};

export default function PharmacyVerificationDocuments({ pharmacyId }: { pharmacyId: string }) {
    const [documents, setDocuments] = useState<VerificationDocument[]>([]);
    const [ownerId, setOwnerId] = useState("");
    const [busyType, setBusyType] = useState<DocumentType | null>(null);
    const [error, setError] = useState("");

    const load = useCallback(async () => {
        const db = requireSupabase();
        const { data: { user }, error: userError } = await db.auth.getUser();
        if (userError) throw userError;
        if (!user) throw new Error("Sign in again to manage verification documents.");
        setOwnerId(user.id);
        const { data, error: documentsError } = await db
            .from("pharmacy_verification_documents")
            .select("id,document_type,review_status,reviewer_note,created_at")
            .eq("pharmacy_id", pharmacyId)
            .order("created_at", { ascending: false });
        if (documentsError) throw documentsError;
        setDocuments((data || []) as VerificationDocument[]);
    }, [pharmacyId]);

    useEffect(() => {
        load().catch((e: unknown) => setError(e instanceof Error ? e.message : "Could not load verification documents."));
    }, [load]);

    async function upload(documentType: DocumentType, file: File) {
        if (!acceptedTypes.has(file.type)) {
            setError("Choose a JPG, PNG, WebP, or PDF file.");
            return;
        }
        if (file.size > 10 * 1024 * 1024) {
            setError("Each verification file must be 10 MB or smaller.");
            return;
        }

        setBusyType(documentType);
        setError("");
        let failureStage = "File upload";
        try {
            const db = requireSupabase();
            const { data: { user }, error: userError } = await db.auth.getUser();
            if (userError) throw userError;
            if (!user) throw new Error("Your session expired. Sign in again and retry.");
            if (user.id !== ownerId) throw new Error("Your sign-in changed. Refresh the page and try again.");

            const { data: ownedPharmacy, error: ownershipError } = await db
                .from("pharmacies")
                .select("id")
                .eq("id", pharmacyId)
                .eq("owner_user_id", user.id)
                .maybeSingle();
            if (ownershipError) throw new Error(`Could not confirm pharmacy ownership: ${ownershipError.message}`);
            if (!ownedPharmacy) throw new Error("This signed-in account is not the assigned owner of this pharmacy.");

            const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
            const storagePath = `${user.id}/${pharmacyId}/${documentType}/${crypto.randomUUID()}_${safeName}`;
            const { error: uploadError } = await db.storage
                .from("carenexa-verification")
                .upload(storagePath, file, { contentType: file.type, upsert: false });
            if (uploadError) {
                const code = "statusCode" in uploadError ? uploadError.statusCode : undefined;
                if (code === "403" || /new row violates row-level security policy/i.test(uploadError.message)) {
                    throw new Error(
                        `${uploadError.message} Pharmacy ownership was confirmed, but Storage rejected the upload in ${configuredProjectHost()}. Apply supabase/migrations/20261024054900_fix_pharmacy_verification_storage_name_ambiguity.sql to this exact project.`,
                    );
                }
                if (code === "400") {
                    throw new Error(`${uploadError.message} Check that the latest pharmacy document storage migration has been applied in Supabase.`);
                }
                throw uploadError;
            }
            failureStage = "Document registration";
            const { error: insertError } = await db.from("pharmacy_verification_documents").insert({
                pharmacy_id: pharmacyId,
                owner_user_id: user.id,
                document_type: documentType,
                storage_path: storagePath,
            });
            if (insertError) {
                const { error: cleanupError } = await db.storage.from("carenexa-verification").remove([storagePath]);
                if (cleanupError) console.error("Could not remove unregistered verification file", cleanupError);
                throw insertError;
            }
            failureStage = "Refreshing document list";
            await load();
        } catch (e) {
            setError(`${failureStage} failed: ${errorMessage(e)}`);
        } finally {
            setBusyType(null);
        }
    }

    return (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-extrabold">Verification documents</h3>
            <p className="mt-2 text-sm leading-6 text-slate-500">
                Upload clear, current documents for review. Files are private and visible only to your account and administrators.
                Accepted formats: JPG, PNG, WebP, or PDF (up to 10 MB each).
            </p>
            {error && <p role="alert" className="mt-3 rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
            <div className="mt-4 space-y-3">
                {DOCUMENTS.map(({ type, label }) => {
                    const latest = documents.find((document) => document.document_type === type);
                    return (
                        <div key={type} className="rounded-xl bg-slate-50 p-3">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div>
                                    <p className="text-sm font-semibold">{label}</p>
                                    <p className="mt-1 text-xs capitalize text-slate-500">
                                        {latest ? displayStatus(latest.review_status) : "Not submitted"}
                                        {latest?.reviewer_note ? ` · ${latest.reviewer_note}` : ""}
                                    </p>
                                </div>
                                <label className="cursor-pointer rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100">
                                    {busyType === type ? "Uploading…" : latest ? "Upload replacement" : "Choose file"}
                                    <input
                                        type="file"
                                        accept="image/jpeg,image/png,image/webp,application/pdf"
                                        disabled={!ownerId || busyType !== null}
                                        className="sr-only"
                                        onChange={(event) => {
                                            const file = event.currentTarget.files?.[0];
                                            event.currentTarget.value = "";
                                            if (file) void upload(type, file);
                                        }}
                                    />
                                </label>
                            </div>
                        </div>
                    );
                })}
            </div>
        </section>
    );
}
