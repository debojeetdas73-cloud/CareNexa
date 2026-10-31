import { useEffect, useRef, useState } from "react";
import type { DragEvent, FormEvent } from "react";
import { Link } from "react-router-dom";
import { Upload, FileImage, X, CheckCircle2, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useScrollReveal } from "@/hooks/useScrollReveal";
import { getCurrentLocation, type Coordinates } from "@/lib/geolocation";
import { requireSupabase } from "@/lib/supabase";

type Props = { customerLocation?: Coordinates | null; requestedMedicine?: string | null };
const MAX_FILE_SIZE = 10 * 1024 * 1024;

async function optimizePrescription(file: File): Promise<File> {
  if (file.size < 700 * 1024 && ["image/jpeg", "image/png", "image/webp"].includes(file.type)) return file;
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1800 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    throw new Error("This image could not be optimized. Please choose another image.");
  }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => result ? resolve(result) : reject(new Error("This image could not be optimized.")), "image/jpeg", 0.86);
  });
  const name = file.name.replace(/\.[^.]+$/, "") || "prescription";
  return new File([blob], `${name}.jpg`, { type: "image/jpeg", lastModified: file.lastModified });
}

const PrescriptionUpload = ({ customerLocation = null, requestedMedicine = null }: Props) => {
  const sectionRef = useScrollReveal();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [nearbyCount, setNearbyCount] = useState(0);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [fulfillment, setFulfillment] = useState<"delivery" | "pickup">("delivery");
  const [coordinates, setCoordinates] = useState<Coordinates | null>(customerLocation);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [uploadStage, setUploadStage] = useState("");
  const [needsSignIn, setNeedsSignIn] = useState(false);

  useEffect(() => {
    if (customerLocation) setCoordinates(customerLocation);
  }, [customerLocation]);

  const handleFile = (selected: File) => {
    if (!["image/jpeg", "image/png", "image/webp"].includes(selected.type)) {
      setSubmitError("Choose a JPG, PNG, or WebP prescription image.");
      return;
    }
    if (selected.size > MAX_FILE_SIZE) {
      setSubmitError("Choose an image under 10 MB. Large images are compressed before upload.");
      return;
    }
    setSubmitError("");
    setFile(selected);
    const reader = new FileReader();
    reader.onload = (event) => setPreview(event.target?.result as string);
    reader.readAsDataURL(selected);
  };

  const handleDrop = (event: DragEvent) => {
    event.preventDefault();
    const selected = event.dataTransfer.files[0];
    if (selected) handleFile(selected);
  };

  const locate = async () => {
    setLocating(true);
    setLocationError("");
    try {
      const location = await getCurrentLocation({ enableHighAccuracy: false, timeout: 8000, maximumAge: 120000 });
      setCoordinates(location);
    } catch (error) {
      setLocationError(error instanceof Error ? error.message : "Could not get your location.");
    } finally {
      setLocating(false);
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!file || !coordinates) return;
    setSubmitting(true);
    setSubmitError("");
    setNeedsSignIn(false);
    const db = requireSupabase();
    let uploadedPath: string | null = null;
    try {
      const { data: { user }, error: authError } = await db.auth.getUser();
      if (authError) throw authError;
      if (!user) {
        setNeedsSignIn(true);
        throw new Error("Sign in to send a prescription to nearby pharmacies.");
      }

      setUploadStage("Preparing image…");
      const optimizedFile = await optimizePrescription(file);
      const requestId = crypto.randomUUID();
      const extension = optimizedFile.type === "image/png" ? "png" : optimizedFile.type === "image/webp" ? "webp" : "jpg";
      const safeFileName = `${requestId}.${extension}`;
      uploadedPath = `${user.id}/${requestId}/${safeFileName}`;

      setUploadStage("Uploading prescription…");
      const { error: uploadError } = await db.storage
        .from("carenexa-prescriptions")
        .upload(uploadedPath, optimizedFile, { contentType: optimizedFile.type, cacheControl: "3600", upsert: false });
      if (uploadError) throw uploadError;

      setUploadStage("Contacting nearby pharmacies…");
      const { data, error: sendError } = await db.rpc("submit_prescription_broadcast", {
        p_request_id: requestId,
        p_customer_name: name.trim(),
        p_customer_phone: phone.trim(),
        p_notes: [requestedMedicine ? `Medicine requested: ${requestedMedicine}` : "", notes.trim()].filter(Boolean).join("\n") || null,
        p_storage_path: uploadedPath,
        p_fulfillment: fulfillment,
        p_delivery_address: fulfillment === "delivery" ? address.trim() : null,
        p_customer_latitude: coordinates.latitude,
        p_customer_longitude: coordinates.longitude,
      });
      if (sendError) throw sendError;
      setNearbyCount(Number(data || 0));
      setSubmitted(true);
    } catch (error) {
      if (uploadedPath) await db.storage.from("carenexa-prescriptions").remove([uploadedPath]);
      setSubmitError(error instanceof Error ? error.message : "Prescription could not be sent. Please try again.");
    } finally {
      setSubmitting(false);
      setUploadStage("");
    }
  };

  const reset = () => {
    setFile(null);
    setPreview(null);
    setSubmitted(false);
    setName("");
    setPhone("");
    setAddress("");
    setNotes("");
    setFulfillment("delivery");
    setSubmitError("");
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <section className="bg-[hsl(var(--surface-warm))] px-4 py-16 md:py-24">
      <div ref={sectionRef} className="container mx-auto max-w-2xl">
        <div className="text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-primary">Prescription</p>
          <h2 className="font-display mt-2 text-3xl font-bold text-foreground md:text-4xl">Send your prescription to nearby pharmacies</h2>
          <p className="mx-auto mt-3 max-w-md text-muted-foreground">Pharmacies within 15 km will be notified. The first one to accept reviews your prescription and sends a medicine quote.</p>
        </div>

        {submitted ? (
          <div className="mx-auto mt-10 max-w-lg rounded-2xl bg-card p-8 text-center shadow-sm animate-fade-up md:p-10">
            <CheckCircle2 className="mx-auto h-16 w-16 text-primary" />
            <h3 className="font-display mt-4 text-2xl font-bold text-foreground">{nearbyCount ? "Your request is being sent" : "No nearby pharmacy found"}</h3>
            <p className="mt-2 text-muted-foreground">
              {nearbyCount
                ? `${nearbyCount} nearby ${nearbyCount === 1 ? "pharmacy was" : "pharmacies were"} notified. The search stays open for 5 minutes. Track responses in your account.`
                : "Your prescription is saved. Open your account to search for a pharmacy directly or resend the nearby request."}
            </p>
            <Link to="/profile" className="mt-5 inline-block text-sm font-bold text-primary underline">Track prescription request</Link>
            <div><Button onClick={reset} className="mt-6" size="lg">Upload Another</Button></div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mx-auto mt-10 rounded-2xl bg-card p-6 shadow-sm md:p-8">
            {(submitError || locationError) && (
              <div role="alert" className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                {submitError || locationError}{needsSignIn && <Link to="/account" className="ml-1 font-bold underline">Sign in</Link>}
              </div>
            )}

            <div className="mb-5 rounded-xl border border-border bg-background p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <MapPin className="h-4 w-4 text-primary" />
                  {coordinates ? "Location ready for nearby search" : "Share your location to find nearby pharmacies"}
                </div>
                <Button type="button" variant="outline" size="sm" onClick={locate} disabled={locating}>
                  {locating ? "Finding location…" : coordinates ? "Refresh location" : "Use my location"}
                </Button>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">Your location is used to find pharmacies within 15 km and show their distance.</p>
            </div>

            <fieldset className="mb-5">
              <legend className="mb-2 block text-sm font-medium text-foreground">How should the pharmacy fulfill your order?</legend>
              <div className="grid grid-cols-2 gap-2">
                {(["delivery", "pickup"] as const).map((choice) => (
                  <button
                    key={choice}
                    type="button"
                    aria-pressed={fulfillment === choice}
                    onClick={() => setFulfillment(choice)}
                    className={`min-h-[44px] rounded-lg border text-sm font-semibold capitalize ${fulfillment === choice ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/40"}`}
                  >{choice === "delivery" ? "Home delivery" : "Store pickup"}</button>
                ))}
              </div>
            </fieldset>

            {requestedMedicine && (
              <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
                <strong>Medicine requested:</strong> {requestedMedicine}. This request will be reviewed by pharmacies with your prescription.
              </div>
            )}

            {fulfillment === "delivery" && (
              <label className="mb-5 block text-sm font-medium text-foreground">Delivery address
                <textarea required value={address} onChange={(event) => setAddress(event.target.value)} rows={2} className="mt-1.5 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" />
              </label>
            )}

            <div
              onDragOver={(event) => event.preventDefault()}
              onDrop={handleDrop}
              onClick={() => fileRef.current?.click()}
              className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 transition-colors ${preview ? "border-primary bg-primary/5" : "border-border hover:border-primary/40 hover:bg-muted/50"}`}
            >
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onClick={(event) => event.stopPropagation()}
                onChange={(event) => event.target.files?.[0] && handleFile(event.target.files[0])}
              />
              {preview ? (
                <div className="relative">
                  <img src={preview} alt="Prescription preview" className="max-h-48 rounded-lg object-contain" />
                  <button type="button" onClick={(event) => { event.stopPropagation(); setFile(null); setPreview(null); if (fileRef.current) fileRef.current.value = ""; }} className="absolute -right-2 -top-2 rounded-full bg-destructive p-1 text-destructive-foreground shadow-md" aria-label="Remove prescription image"><X className="h-3.5 w-3.5" /></button>
                  <p className="mt-2 text-center text-sm font-medium text-primary">{file?.name}</p>
                </div>
              ) : (
                <>
                  <div className="mb-3 rounded-xl bg-primary/10 p-3 text-primary"><FileImage className="h-8 w-8" /></div>
                  <p className="font-medium text-foreground">Drop your prescription image here</p>
                  <p className="mt-1 text-sm text-muted-foreground">or click to browse · JPG, PNG, WebP · up to 10 MB</p>
                </>
              )}
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-medium text-foreground">Full Name
                <input required value={name} onChange={(event) => setName(event.target.value)} className="mt-1.5 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm" />
              </label>
              <label className="block text-sm font-medium text-foreground">Phone Number
                <input required value={phone} onChange={(event) => setPhone(event.target.value)} className="mt-1.5 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm" />
              </label>
            </div>

            <label className="mt-4 block text-sm font-medium text-foreground">Additional Notes (optional)
              <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={2} maxLength={1000} placeholder="Any allergies or special instructions…" className="mt-1.5 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground" />
            </label>

            <Button type="submit" size="lg" className="mt-6 w-full" disabled={submitting || !file || !name.trim() || !phone.trim() || !coordinates || (fulfillment === "delivery" && !address.trim())}>
              <Upload className="h-4 w-4" />
              {submitting ? uploadStage || "Sending prescription…" : "Notify nearby pharmacies"}
            </Button>
          </form>
        )}
      </div>
    </section>
  );
};

export default PrescriptionUpload;
