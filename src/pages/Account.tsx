import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import { isSupabaseConfigured, requireSupabase } from "@/lib/supabase";

export default function Account() {
  const [mode,setMode]=useState<"login"|"signup">("login");
  const [role,setRole]=useState<"customer"|"pharmacy_owner">("customer");
  const [name,setName]=useState(""); const [email,setEmail]=useState(""); const [phone,setPhone]=useState("");
  const [age,setAge]=useState(""); const [bloodGroup,setBloodGroup]=useState("");
  const [city,setCity]=useState(""); const [district,setDistrict]=useState("");
  const [password,setPassword]=useState(""); const [message,setMessage]=useState(""); const [busy,setBusy]=useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [needsConfirmation,setNeedsConfirmation]=useState(false);
  const [resending,setResending]=useState(false);
  const [checkingSession,setCheckingSession]=useState(true);
  const navigate=useNavigate();

  const passwordRules = {
    length: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /\d/.test(password),
    special: /[^A-Za-z0-9]/.test(password),
  };

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const db = requireSupabase();
        const { data, error } = await db.auth.getUser();
        if (error || !data.user) return;
        const { data: profile } = await db.from("profiles").select("role").eq("id", data.user.id).maybeSingle();
        if (!live) return;
        if (profile?.role === "admin") navigate("/admin", { replace: true });
        else if (profile?.role === "pharmacy_owner" || data.user.user_metadata?.requested_role === "pharmacy_owner") navigate("/pharmacy-onboarding", { replace: true });
        else navigate("/profile", { replace: true });
      } catch {
        // Keep the sign-in form available when auth is not configured or the session cannot be read.
      } finally {
        if (live) setCheckingSession(false);
      }
    })();
    return () => { live = false; };
  }, [navigate]);

  if (checkingSession) {
    return <main className="grid min-h-screen place-items-center bg-background px-4"><p className="rounded-xl border bg-card px-5 py-4 text-sm text-muted-foreground">Checking your account…</p></main>;
  }

  async function submit(e:React.FormEvent) {
    e.preventDefault(); setBusy(true); setMessage(""); setNeedsConfirmation(false);
    try {
      const db=requireSupabase();
      if(mode==="signup") {
        const {data,error}=await db.auth.signUp({
          email,
          password,
          options:{
            data:{
              full_name:name,
              phone,
              requested_role:role,
              ...(role==="customer"?{age:Number(age),blood_group:bloodGroup,city,district}:{}),
            },
            emailRedirectTo:`${window.location.origin}/${role==="pharmacy_owner"?"pharmacy-onboarding":"profile"}`,
          },
        });
        if(error) throw error;
        if(data.user && !data.session) {
          setNeedsConfirmation(true);
          setMessage(role==="pharmacy_owner"
            ? `Account created. Confirm ${email} using the link we sent. After confirmation, you will continue to pharmacy setup. Check your inbox and spam folder.`
            : `Account created. Supabase requires you to confirm ${email} before signing in. Check your inbox and spam folder.`);
        } else if(data.user) {
          if(role==="pharmacy_owner") navigate("/pharmacy-onboarding", { replace: true });
          else setMessage("Account created. Email confirmation is currently disabled in Supabase, so you can sign in now.");
        }
      } else {
        const {data,error}=await db.auth.signInWithPassword({email,password});
        if(error) throw error;
        const {data:profile,error:profileError}=await db.from("profiles").select("role").eq("id",data.user.id).maybeSingle();
        if(profileError) throw profileError;
        if(profile?.role==="admin") navigate("/admin", { replace: true });
        else if(role==="pharmacy_owner" && (profile?.role==="pharmacy_owner" || data.user.user_metadata?.requested_role==="pharmacy_owner")) navigate("/pharmacy-onboarding", { replace: true });
        else navigate("/profile", { replace: true });
      }
    } catch(e) { setMessage(e instanceof Error?e.message:"Authentication failed"); }
    finally { setBusy(false); }
  }
  async function resendConfirmation() {
    setResending(true);
    setMessage("");
    try {
      const {error}=await requireSupabase().auth.resend({
        type:"signup",
        email,
        options:{emailRedirectTo:`${window.location.origin}/${role==="pharmacy_owner"?"pharmacy-onboarding":"profile"}`},
      });
      if(error) throw error;
      setMessage(`Supabase accepted a confirmation resend request for ${email}. Check your inbox and spam folder.`);
    } catch(e) {
      setMessage(e instanceof Error?e.message:"Could not resend the confirmation email.");
    } finally {
      setResending(false);
    }
  }
  return <main className="min-h-screen bg-background px-4 py-12"><div className="mx-auto max-w-lg rounded-2xl border bg-card p-7 shadow-sm">
    <Link to="/" className="text-sm text-primary">← CareNexa</Link>
    <h1 className="mt-5 text-3xl font-bold">{mode==="login"?"Welcome back":"Create your account"}</h1>
    <p className="mt-2 text-sm text-muted-foreground">Choose the account type that matches how you use CareNexa.</p>
    {!isSupabaseConfigured&&<p role="alert" className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">Supabase is not configured. Create a root .env file using .env.example, then restart the dev server. Sign-ups and database writes are disabled until it is connected.</p>}
    <div className="mt-5 grid grid-cols-2 gap-2"><button onClick={()=>setRole("customer")} className={`rounded-xl border p-3 ${role==="customer"?"border-primary bg-primary/5":""}`}>Customer</button><button onClick={()=>setRole("pharmacy_owner")} className={`rounded-xl border p-3 ${role==="pharmacy_owner"?"border-primary bg-primary/5":""}`}>Pharmacy owner</button></div>
    <form onSubmit={submit} className="mt-5 space-y-4">
      {mode==="signup"&&<><label className="block text-sm">Full name<input required value={name} onChange={e=>setName(e.target.value)} className="mt-1 w-full rounded-lg border bg-background p-3"/></label><label className="block text-sm">Phone<input required value={phone} onChange={e=>setPhone(e.target.value)} className="mt-1 w-full rounded-lg border bg-background p-3"/></label>
        {role==="customer"&&<>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm">Age<input type="number" min={1} max={120} required value={age} onChange={e=>setAge(e.target.value)} className="mt-1 w-full rounded-lg border bg-background p-3"/></label>
            <label className="block text-sm">Blood group<select required value={bloodGroup} onChange={e=>setBloodGroup(e.target.value)} className="mt-1 w-full rounded-lg border bg-background p-3"><option value="">Select blood group</option>{["A+","A-","B+","B-","AB+","AB-","O+","O-"].map(group=><option key={group} value={group}>{group}</option>)}</select></label>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm">City<input required value={city} onChange={e=>setCity(e.target.value)} className="mt-1 w-full rounded-lg border bg-background p-3"/></label>
            <label className="block text-sm">District<input required value={district} onChange={e=>setDistrict(e.target.value)} className="mt-1 w-full rounded-lg border bg-background p-3"/></label>
          </div>
        </>}
      </>}
      <label className="block text-sm">Email<input type="email" required value={email} onChange={e=>setEmail(e.target.value)} className="mt-1 w-full rounded-lg border bg-background p-3"/></label>
      <label className="block text-sm">Password
        <div className="mt-1 relative">
          <input
            type={showPassword ? "text" : "password"}
            minLength={8}
            required
            value={password}
            onChange={e=>setPassword(e.target.value)}
            className="w-full rounded-lg border bg-background p-3 pr-10"
          />
          <button
            type="button"
            onClick={()=>setShowPassword(!showPassword)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700"
          >
            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
        {mode === "signup" && password.length > 0 && (
          <div className="mt-2 space-y-1 text-xs">
            <div className={`flex items-center gap-2 ${passwordRules.length ? "text-emerald-600" : "text-slate-400"}`}>
              <span className={passwordRules.length ? "text-emerald-500" : "text-slate-300"}>✓</span>
              At least 8 characters
            </div>
            <div className={`flex items-center gap-2 ${passwordRules.uppercase ? "text-emerald-600" : "text-slate-400"}`}>
              <span className={passwordRules.uppercase ? "text-emerald-500" : "text-slate-300"}>✓</span>
              One uppercase letter
            </div>
            <div className={`flex items-center gap-2 ${passwordRules.lowercase ? "text-emerald-600" : "text-slate-400"}`}>
              <span className={passwordRules.lowercase ? "text-emerald-500" : "text-slate-300"}>✓</span>
              One lowercase letter
            </div>
            <div className={`flex items-center gap-2 ${passwordRules.number ? "text-emerald-600" : "text-slate-400"}`}>
              <span className={passwordRules.number ? "text-emerald-500" : "text-slate-300"}>✓</span>
              One number
            </div>
            <div className={`flex items-center gap-2 ${passwordRules.special ? "text-emerald-600" : "text-slate-400"}`}>
              <span className={passwordRules.special ? "text-emerald-500" : "text-slate-300"}>✓</span>
              One special character
            </div>
          </div>
        )}
      </label>
      {message&&<p role="status" className="rounded-lg bg-muted p-3 text-sm">{message}</p>}
      <button disabled={busy} className="w-full rounded-lg bg-primary p-3 font-semibold text-primary-foreground disabled:opacity-50">{busy?"Please wait…":mode==="login"?"Sign in":"Create account"}</button>
    </form>
    {needsConfirmation&&<button type="button" disabled={resending} onClick={resendConfirmation} className="mt-3 w-full rounded-lg border p-3 text-sm font-semibold disabled:opacity-50">{resending?"Sending…":"Resend confirmation email"}</button>}
    <button className="mt-4 text-sm text-primary underline" onClick={()=>{setMode(mode==="login"?"signup":"login");setMessage("")}}>{mode==="login"?"New here? Create an account":"Already registered? Sign in"}</button>
    {role==="pharmacy_owner"&&mode==="signup"&&<p className="mt-4 text-xs text-muted-foreground">Choosing pharmacy owner sends a request only; it does not grant owner access. An administrator must assign the owner role after verification.</p>}
  </div></main>;
}
