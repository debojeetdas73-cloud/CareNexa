import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Phone, Menu, X } from "lucide-react";
import { isSupabaseConfigured, requireSupabase } from "@/lib/supabase";

const Navbar = () => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const db = requireSupabase();
    db.auth.getSession().then(({ data }) => setSignedIn(Boolean(data.session)));
    const { data: { subscription } } = db.auth.onAuthStateChange((_event, session) => {
      setSignedIn(Boolean(session));
    });
    return () => subscription.unsubscribe();
  }, []);

  return (
    <nav className="sticky top-0 z-50 border-b border-border/60 bg-card/80 backdrop-blur-xl">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <Link to="/" className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
            <Phone className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="font-display text-xl font-bold text-foreground">
            CareNexa
          </span>
        </Link>

        <div className="hidden items-center gap-8 md:flex">
          <a href="#search" className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">Find Medicine</a>
          <Link to="/hospitals" className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">Find Hospitals</Link>
          <a href="#how-it-works" className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">How It Works</a>
          <a href="#pharmacies" className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">Pharmacies</a>
          <Link to="/account">
            <Button size="sm">{signedIn === null ? "Account" : signedIn ? "My account" : "Sign In"}</Button>
          </Link>
        </div>

        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="rounded-lg p-2 text-foreground transition-colors hover:bg-muted md:hidden"
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {mobileOpen && (
        <div className="border-t border-border bg-card px-4 py-4 md:hidden">
          <div className="flex flex-col gap-3">
            <a href="#search" className="rounded-lg px-3 py-2 text-sm font-medium text-foreground hover:bg-muted">Find Medicine</a>
            <Link to="/hospitals" onClick={() => setMobileOpen(false)} className="rounded-lg px-3 py-2 text-sm font-medium text-foreground hover:bg-muted">Find Hospitals</Link>
            <a href="#how-it-works" className="rounded-lg px-3 py-2 text-sm font-medium text-foreground hover:bg-muted">How It Works</a>
            <a href="#pharmacies" className="rounded-lg px-3 py-2 text-sm font-medium text-foreground hover:bg-muted">Pharmacies</a>
            <Link to="/account" onClick={() => setMobileOpen(false)}>
              <Button size="sm" className="mt-2 w-full">{signedIn === null ? "Account" : signedIn ? "My account" : "Sign In"}</Button>
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
};

export default Navbar;
