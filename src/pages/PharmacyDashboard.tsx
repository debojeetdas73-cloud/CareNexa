import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { requireSupabase } from "@/lib/supabase";
import PharmacyInventoryWorkspace from "@/components/PharmacyInventoryWorkspace";
import DistributorManagement from "@/components/DistributorManagement";
import type { InventoryBatch, InventoryMovement, InventoryPurchase, InventorySection } from "@/components/PharmacyInventoryWorkspace";
import OrderMedicineList from "@/components/pharmacy/OrderMedicineList";
import OrderQuoteModal from "@/components/pharmacy/OrderQuoteModal";
import OrderCard from "@/components/pharmacy/OrderCard";
import PrescriptionOrdersPanel from "@/components/pharmacy/PrescriptionOrdersPanel";
import { Empty } from "@/components/pharmacy/DashboardPrimitives";
import { clock, DutyPanel, IncomingRequestAlert, offerDeadline } from "@/components/pharmacy/PharmacyDutyPanel";
import PharmacyCustomers from "@/pages/pharmacy/PharmacyCustomers";
import PharmacyEarnings from "@/pages/pharmacy/PharmacyEarnings";
import PharmacyOverview from "@/pages/pharmacy/PharmacyOverview";
import PharmacyOrders from "@/pages/pharmacy/PharmacyOrders";
import PharmacyProfile from "@/pages/pharmacy/PharmacyProfile";
import PharmacyMembership from "@/components/membership/PharmacyMembership";
import type { InventoryMedicine as Inv, Order, OrderItem, OrderMedicine, PharmacyRecord, PrescriptionOffer, PrescriptionOrder } from "@/components/pharmacy/types";
import { toast } from "sonner";
import IncomingOrderAlert from "@/components/pharmacy/IncomingOrderAlert";
import PharmacySounds from "@/pages/pharmacy/PharmacySounds";
import { ALERT_REPEAT_MS, getSoundPrefs, playAlertSound, setSoundEnabledPref, startTicker } from "@/lib/alertSounds";
import type { AlertSoundId } from "@/lib/alertSounds";
import {
    Bell,
    Boxes,
    Building2,
    CalendarDays,
    ClipboardList,
    Clock3,
    CircleAlert,
    LayoutDashboard,
    LogOut,
    Pill,
    Plus,
    RefreshCw,
    ShoppingBag,
    Store,
    Users,
    Volume2,
    Wallet,
} from "lucide-react";

/* ================= types ================= */
type OrderItemQueryRow = Omit<OrderItem, "medicine"> & {
    medicine: OrderMedicine | OrderMedicine[] | null;
};
type Tab = "overview" | "inventory" | "distributors" | "orders" | "customers" | "earnings" | "sounds" | "profile";
const INVENTORY_SECTIONS: InventorySection[] = ["overview", "medicines", "purchase", "batches", "low-stock", "expiry", "history", "import-export"];
const INVENTORY_NAV: Array<[InventorySection, string]> = [
    ["overview", "Inventory overview"],
    ["medicines", "All medicines"],
    ["purchase", "Purchase / Add stock"],
    ["batches", "Batch management"],
    ["low-stock", "Low stock"],
    ["expiry", "Expiry management"],
    ["history", "Stock history"],
    ["import-export", "Import / Export"],
];

/* ================= helpers ================= */
const money = (v: number) => `₹${Number(v || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const TABS: Tab[] = ["overview", "inventory", "distributors", "orders", "customers", "earnings", "sounds", "profile"];
const readTab = (pathname = typeof window === "undefined" ? "" : window.location.pathname, hash = typeof window === "undefined" ? "" : window.location.hash): Tab => {
    if (pathname.startsWith("/pharmacy-dashboard/inventory/")) return "inventory";
    if (pathname === "/pharmacy-dashboard/distributors") return "distributors";
    const h = hash.replace(/^#/, "");
    if (h.startsWith("inventory/")) return "inventory";
    return TABS.includes(h as Tab) ? h as Tab : "overview";
};
const readInventorySection = (pathname = typeof window === "undefined" ? "" : window.location.pathname, hash = typeof window === "undefined" ? "" : window.location.hash): InventorySection => {
    if (pathname.startsWith("/pharmacy-dashboard/inventory/")) {
        const segments = pathname.split("/");
        const section = segments[segments.length - 1] as InventorySection;
        return INVENTORY_SECTIONS.includes(section) ? section : "overview";
    }
    const section = hash.replace(/^#inventory\/?/, "") as InventorySection;
    return INVENTORY_SECTIONS.includes(section) ? section : "overview";
};
const statusOf = (o: Order) => (o.status || "pending").toLowerCase();
const isNew = (o: Order) => ["pending", "requested"].includes(statusOf(o)) && !o.quote_sent_at;
const isAwaitingCustomer = (o: Order) =>
    statusOf(o) === "pending" && !!o.quote_sent_at && !o.customer_accepted_quote_at;
const isDone = (o: Order) => statusOf(o) === "completed";
const isDelivery = (o: Order) => /deliver/i.test(o.fulfillment_choice || "");
const isPickup = (o: Order) => /pick/i.test(o.fulfillment_choice || "");
const dayKey = (d: Date) => d.toLocaleDateString("en-CA"); // YYYY-MM-DD in local time
const timeAgo = (iso: string) => {
    const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
    if (m < 1) return "just now";
    if (m < 60) return `${m} min ago`;
    const h = Math.round(m / 60);
    if (h < 24) return `${h} hr ago`;
    return `${Math.round(h / 24)} d ago`;
};
/* ================= component ================= */
export default function PharmacyDashboard() {
    const navigate = useNavigate();
    const location = useLocation();
    const [pharmacy, setPharmacy] = useState<PharmacyRecord | null>(null);
    const [inventory, setInventory] = useState<Inv[]>([]);
    const [batches, setBatches] = useState<InventoryBatch[]>([]);
    const [purchases, setPurchases] = useState<InventoryPurchase[]>([]);
    const [stockMovements, setStockMovements] = useState<InventoryMovement[]>([]);
    const [hasMoreMovements, setHasMoreMovements] = useState(false);
    const [orders, setOrders] = useState<Order[]>([]);
    const [prescriptionOrders, setPrescriptionOrders] = useState<PrescriptionOrder[]>([]);
    const [prescriptionOffers, setPrescriptionOffers] = useState<PrescriptionOffer[]>([]);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(true);
    const [busyOrder, setBusyOrder] = useState<string | null>(null);
    const [quoteOrder, setQuoteOrder] = useState<Order | null>(null);
    const [quoteDiscount, setQuoteDiscount] = useState("0");
    const [quoteMessage, setQuoteMessage] = useState("");
    const [notificationSound, setNotificationSound] = useState(() => getSoundPrefs().enabled);
    const [dutyBusy, setDutyBusy] = useState(false);
    const audioContextRef = useRef<AudioContext | null>(null);
    const refreshDashboardRef = useRef<((showLoading: boolean) => Promise<void>) | null>(null);
    const [now, setNow] = useState(() => Date.now());
    const autoPassedRef = useRef<Set<string>>(new Set());
    const lastRingAtRef = useRef(0);
    const ORDER_ALERT_MS = 30_000;
    const orderSeenRef = useRef<Map<string, number>>(new Map());
    const ordersReadyRef = useRef(false);
    const missedOrdersRef = useRef<Set<string>>(new Set());
    const [dismissedOrders, setDismissedOrders] = useState<string[]>([]);
    const [audioBlocked, setAudioBlocked] = useState(false);
    const knownOrderIdsRef = useRef<Set<string>>(new Set());

    const [tab, setTabState] = useState<Tab>(() => readTab(location.pathname, location.hash));
    const [inventorySection, setInventorySection] = useState<InventorySection>(() => readInventorySection(location.pathname, location.hash));
    const [orderView, setOrderView] = useState<"board" | "list">("board");
    const [orderFilter, setOrderFilter] = useState<"all" | "delivery" | "pickup">("all");
    const [range, setRange] = useState<7 | 30>(30);
    const [custQuery, setCustQuery] = useState("");
    /* orders date filter and refill reminders */
    const [orderDate, setOrderDate] = useState<"all" | "today" | "tomorrow" | "yesterday">("all");
    const [refillDays, setRefillDays] = useState(25);

    function go(t: Tab) {
        if (t === "inventory") {
            goInventory("overview");
            return;
        }
        if (t === "distributors") {
            goDistributors();
            return;
        }
        setTabState(t);
        navigate({ pathname: "/pharmacy-dashboard", hash: `#${t}` }, { replace: true });
        window.scrollTo({ top: 0 });
    }
    function goInventory(section: InventorySection) {
        setTabState("inventory");
        setInventorySection(section);
        navigate(`/pharmacy-dashboard/inventory/${section}`, { replace: true });
        window.scrollTo({ top: 0 });
    }
    function goDistributors(medicineId?: string, quantity?: number) {
        setTabState("distributors");
        const params = new URLSearchParams();
        if (medicineId) params.set("medicineId", medicineId);
        if (quantity !== undefined) params.set("quantity", String(quantity));
        navigate({ pathname: "/pharmacy-dashboard/distributors", search: params.toString() ? `?${params.toString()}` : "" });
        window.scrollTo({ top: 0 });
    }
    function handleInventorySubmenuKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
        if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        const items = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-inventory-item='true']"));
        const current = items.indexOf(event.currentTarget);
        const next = event.key === "Home" ? 0
            : event.key === "End" ? items.length - 1
                : (current + (event.key === "ArrowDown" ? 1 : items.length - 1)) % items.length;
        items[next]?.focus();
    }
    useEffect(() => {
        const nextTab = readTab(location.pathname, location.hash);
        setTabState(nextTab);
        setInventorySection(readInventorySection(location.pathname, location.hash));
    }, [location.pathname, location.hash]);

    async function load(showLoadingOrEvent: boolean | MouseEvent<HTMLButtonElement> = true) {
        const showLoading = typeof showLoadingOrEvent === "boolean" ? showLoadingOrEvent : true;
        if (showLoading) setLoading(true);
        setError("");
        try {
            const db = requireSupabase();
            const { data: { user }, error: authError } = await db.auth.getUser();
            if (authError) throw authError;
            if (!user) {
                setError("Sign in with your pharmacy-owner account.");
                return;
            }
            const { data: p, error: pe } = await db.from("pharmacies").select("*").eq("owner_user_id", user.id).maybeSingle();
            if (pe) throw pe;
            if (!p) {
                setError("No pharmacy profile is linked to this account yet. Pharmacy registration must be completed first.");
                return;
            }
            setPharmacy(p);
            const [ir, or, br, pr, mr, prescriptionResult, offerResult] = await Promise.all([
                db.from("pharmacy_inventory_status").select("*").eq("pharmacy_id", p.id).order("medicine_name"),
                db
                    .from("orders")
                    .select("id,order_number,status,customer_name,customer_phone,subtotal,final_total,discount_amount,created_at,completed_at,fulfillment_choice,delivery_address,quote_sent_at,customer_accepted_quote_at,quote_message,prescription_order_id")
                    .eq("pharmacy_id", p.id)
                    .order("created_at", { ascending: false }),
                db.from("medicine_batches")
                    .select("id,medicine_id,batch_number,expiry_date,manufacturing_date,quantity_received,quantity_remaining,purchase_cost_per_unit,selling_price_per_unit,supplier_name,received_at,stock_status")
                    .eq("pharmacy_id", p.id)
                    .order("expiry_date", { ascending: true }),
                db.from("purchases")
                    .select("id,supplier_name,invoice_number,purchased_at,total_cost,notes")
                    .eq("pharmacy_id", p.id)
                    .order("purchased_at", { ascending: false })
                    .limit(100),
                db.from("stock_movements")
                    .select("id,medicine_id,batch_id,movement_type,quantity_change,unit_cost,unit_selling_price,reference_type,reference_id,note,created_by,created_at")
                    .eq("pharmacy_id", p.id)
                    .order("created_at", { ascending: false })
                    .limit(500),
                db.from("prescription_orders")
                    .select("id,customer_name,customer_phone,notes,status,created_at,fulfillment_choice,delivery_address,accepted_distance_km,order_id,storage_path")
                    .eq("pharmacy_id", p.id)
                    .order("created_at", { ascending: false }),
                db.from("prescription_offers")
                    .select("id,prescription_order_id,pharmacy_id,round_number,distance_km,fulfillment_choice,status,expires_at,created_at")
                    .eq("pharmacy_id", p.id)
                    .in("status", ["offered", "accepted"])
                    .order("created_at", { ascending: false }),
            ]);
            if (ir.error) throw ir.error;
            if (or.error) throw or.error;
            if (br.error) throw br.error;
            if (pr.error) throw pr.error;
            if (mr.error) throw mr.error;
            if (prescriptionResult.error) throw prescriptionResult.error;
            if (offerResult.error) throw offerResult.error;
            const orderRows = (or.data || []) as Omit<Order, "items">[];
            const itemsByOrder = new Map<string, Map<string, OrderItem>>();
            if (orderRows.length > 0) {
                const { data: itemData, error: itemError } = await db
                    .from("order_items")
                    .select("id,order_id,medicine_id,quantity,unit_selling_price,line_total,medicine:medicines!order_items_medicine_id_fkey(id,name,generic_name,brand_name,strength,dosage_form)")
                    .in("order_id", orderRows.map((order) => order.id));
                if (itemError) throw itemError;
                const itemRows = (itemData || []) as unknown as OrderItemQueryRow[];
                itemRows.forEach((row) => {
                    const medicine = Array.isArray(row.medicine) ? row.medicine[0] || null : row.medicine || null;
                    const item: OrderItem = {
                        id: row.id,
                        order_id: row.order_id,
                        medicine_id: row.medicine_id,
                        quantity: Number(row.quantity),
                        unit_selling_price: Number(row.unit_selling_price),
                        line_total: Number(row.line_total),
                        medicine,
                    };
                    const orderItems = itemsByOrder.get(item.order_id) || new Map<string, OrderItem>();
                    // Deduplicate by the stable order_items primary key, retaining separate legitimate lines.
                    orderItems.set(item.id, item);
                    itemsByOrder.set(item.order_id, orderItems);
                });
            }
            const prescriptionRows = await Promise.all((prescriptionResult.data || []).map(async (request) => {
                if (request.status !== "accepted") return { ...request, signed_url: null } as PrescriptionOrder;
                const { data: signedFile } = await db.storage
                    .from("carenexa-prescriptions")
                    .createSignedUrl(request.storage_path, 15 * 60);
                return { ...request, signed_url: signedFile?.signedUrl || null } as PrescriptionOrder;
            }));
            setInventory(ir.data || []);
            setOrders(orderRows.map((order) => ({ ...order, items: [...(itemsByOrder.get(order.id)?.values() || [])] })));
            setPrescriptionOrders(prescriptionRows);
            setPrescriptionOffers((offerResult.data || []) as PrescriptionOffer[]);
            setBatches((br.data || []) as InventoryBatch[]);
            setPurchases((pr.data || []) as InventoryPurchase[]);
            setStockMovements((mr.data || []) as InventoryMovement[]);
            setHasMoreMovements((mr.data || []).length === 500);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not load pharmacy dashboard");
        } finally {
            if (showLoading) setLoading(false);
        }
    }
    refreshDashboardRef.current = (showLoading) => load(showLoading);
    useEffect(() => {
        load();
    }, []);

    async function setPharmacyDuty(onDuty: boolean) {
        if (!pharmacy || dutyBusy) return;
        if (onDuty && pharmacy.verification_status !== "approved") {
            toast.error("Your pharmacy must be approved before it can go on duty.");
            return;
        }
        if (onDuty) primeAudio();
        setDutyBusy(true);
        try {
            const { data, error: dutyError } = await requireSupabase()
                .from("pharmacies")
                .update({ is_active: onDuty })
                .eq("id", pharmacy.id)
                .select("is_active")
                .maybeSingle();
            if (dutyError) throw dutyError;
            if (!data) throw new Error("Could not update duty status. Refresh the page and try again.");
            setPharmacy((current) => current ? { ...current, is_active: data.is_active } : current);
            if (onDuty) { setNotificationSound(true); setSoundEnabledPref(true); }
            toast.success(onDuty ? "You are on duty. New requests will ring here." : "Your pharmacy is off duty and hidden from new customer requests.");
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "Could not change pharmacy duty status.");
        } finally {
            setDutyBusy(false);
        }
    }

    function primeAudio() {
        try {
            const context = audioContextRef.current || new AudioContext();
            audioContextRef.current = context;
            void context.resume();
            return true;
        } catch {
            return false;
        }
    }

    /* Loud two-tone ring, six notes. Plays on every new request and repeats while the alert is on screen. */
    const playRing = useCallback((force = false) => {
        if (!notificationSound && !force) return;
        let context = audioContextRef.current;
        if (!context) {
            try {
                context = new AudioContext();
                audioContextRef.current = context;
            } catch {
                return;
            }
        }
        lastRingAtRef.current = Date.now();
        const prefs = getSoundPrefs();
        playAlertSound(context, prefs.sound, prefs.volume);
    }, [notificationSound]);
    const playPrescriptionTone = useCallback(() => playRing(), [playRing]);

    function previewSound(id: AlertSoundId, volume: number) {
        if (!primeAudio() || !audioContextRef.current) {
            toast.error("This browser could not play the sound");
            return;
        }
        playAlertSound(audioContextRef.current, id, volume);
    }

    function togglePrescriptionSound() {
        if (notificationSound) {
            setNotificationSound(false);
            setSoundEnabledPref(false);
            return;
        }
        if (!primeAudio()) {
            toast.error("This browser could not enable alert sound");
            return;
        }
        setNotificationSound(true);
        setSoundEnabledPref(true);
        playRing(true);
        toast.success("Order and prescription alert sound enabled");
    }

    useEffect(() => {
        if (!pharmacy?.id) return;
        const db = requireSupabase();
        if (typeof db.channel !== "function") return;
        const channel = db.channel(`pharmacy-prescription-alerts-${pharmacy.id}`)
            .on("postgres_changes", {
                event: "INSERT",
                schema: "public",
                table: "notifications",
                filter: `pharmacy_id=eq.${pharmacy.id}`,
            }, (payload) => {
                const notification = payload.new as { kind?: string; title?: string; message?: string };
                if (notification.kind === "quote_accepted" || notification.kind === "quote_declined") {
                    void refreshDashboardRef.current?.(false);
                    toast.info(notification.title || "Order updated", { description: notification.message });
                    return;
                }
                if (notification.kind !== "new_prescription" && notification.kind !== "new_order") return;
                toast.info(notification.title || (notification.kind === "new_prescription" ? "Nearby prescription request" : "New pharmacy order"), { description: notification.message });
                playPrescriptionTone();
                void refreshDashboardRef.current?.(false);
            })
            .subscribe();
        return () => { void db.removeChannel(channel); };
    }, [pharmacy?.id, playPrescriptionTone]);

    async function loadMoreMovements() {
        if (!pharmacy || !hasMoreMovements) return;
        try {
            const { data, error: movementError } = await requireSupabase().from("stock_movements")
                .select("id,medicine_id,batch_id,movement_type,quantity_change,unit_cost,unit_selling_price,reference_type,reference_id,note,created_by,created_at")
                .eq("pharmacy_id", pharmacy.id)
                .order("created_at", { ascending: false })
                .range(stockMovements.length, stockMovements.length + 499);
            if (movementError) throw movementError;
            const older = (data || []) as InventoryMovement[];
            setStockMovements((current) => {
                const known = new Set(current.map((movement) => movement.id));
                return [...current, ...older.filter((movement) => !known.has(movement.id))];
            });
            setHasMoreMovements(older.length === 500);
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "Could not load older stock history.");
        }
    }

    async function setOrderStatus(id: string, status: "processing" | "ready" | "completed" | "cancelled") {
        try {
            setBusyOrder(id);
            const db = requireSupabase();
            const { error } = await db.rpc("pharmacy_update_order_status", {
                p_order_id: id,
                p_status: status,
            });
            if (error) throw error;
            await load(false);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not update the order");
        } finally {
            setBusyOrder(null);
        }
    }

    async function claimPrescription(offerId: string) {
        try {
            setBusyOrder(offerId);
            const { data, error: claimError } = await requireSupabase().rpc("pharmacy_claim_prescription", { p_offer_id: offerId });
            if (claimError) throw claimError;
            if (data) {
                toast.success("Prescription accepted. Check your stock and prepare a quote.");
                go("orders");
            } else toast.info("The request expired before you could accept it.");
            await load(false);
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "Could not accept the prescription request.");
        } finally {
            setBusyOrder(null);
        }
    }

    async function rejectPrescription(offerId: string, timedOut = false) {
        try {
            setBusyOrder(offerId);
            const { error: rejectError } = await requireSupabase().rpc("pharmacy_reject_prescription", { p_offer_id: offerId });
            if (rejectError) throw rejectError;
            if (timedOut) toast.info("Not answered in 30 seconds. The request moved to the next nearby pharmacy.");
            else toast.success("Request passed to the other pharmacies in this search.");
            await load(false);
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "Could not reject the prescription request.");
        } finally {
            setBusyOrder(null);
        }
    }

    async function releasePrescription(requestId: string) {
        try {
            setBusyOrder(requestId);
            const { data, error: releaseError } = await requireSupabase().rpc("pharmacy_release_prescription", { p_request_id: requestId });
            if (releaseError) throw releaseError;
            toast.info(Number(data || 0) ? "Request sent to other nearby pharmacies." : "No other nearby pharmacy was found.");
            await load(false);
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "Could not pass the request to another pharmacy.");
        } finally {
            setBusyOrder(null);
        }
    }

    async function quotePrescription(requestId: string, items: Array<{ medicine_id: string; quantity: number }>, discount: number, message: string) {
        try {
            setBusyOrder(requestId);
            const { error: quoteError } = await requireSupabase().rpc("pharmacy_quote_prescription_order", {
                p_request_id: requestId,
                p_items: items,
                p_discount: discount,
                p_message: message.trim() || null,
            });
            if (quoteError) throw quoteError;
            toast.success("Medicine list and final price sent to the customer.");
            await load(false);
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "Could not send the prescription quote.");
        } finally {
            setBusyOrder(null);
        }
    }

    async function sendQuote() {
        if (!quoteOrder) return;
        const discount = Number(quoteDiscount);
        const itemSubtotalCents = quoteOrder.items.reduce((sum, item) => sum + Math.round(Number(item.line_total || 0) * 100), 0);
        const orderSubtotalCents = Math.round(Number(quoteOrder.subtotal) * 100);
        if (!Number.isFinite(Number(quoteOrder.subtotal)) || itemSubtotalCents !== orderSubtotalCents) {
            setError("The medicine item totals no longer match the order subtotal. Refresh the dashboard before quoting.");
            return;
        }
        const discountCents = Math.round(discount * 100);
        if (!quoteOrder.items.length || !Number.isFinite(discount) || discount < 0 || discountCents > itemSubtotalCents || Math.abs(discount * 100 - discountCents) >= 0.0001) {
            setError("Enter a discount between ₹0 and the order subtotal.");
            return;
        }
        try {
            setBusyOrder(quoteOrder.id);
            const { error } = await requireSupabase().rpc("pharmacy_quote_order", {
                p_order_id: quoteOrder.id,
                p_final_total: (itemSubtotalCents - discountCents) / 100,
                p_discount: discountCents / 100,
                p_message: quoteMessage.trim() || null,
            });
            if (error) throw error;
            setQuoteOrder(null);
            setQuoteDiscount("0");
            setQuoteMessage("");
            await load(false);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not send the order quote");
        } finally {
            setBusyOrder(null);
        }
    }

    /* ---------- derived: inventory ---------- */
    const eligibleStock = (row: Inv) => {
        const rows = batches.filter((batch) => batch.medicine_id === row.medicine_id);
        if (!rows.length) return Number(row.quantity_on_hand || 0);
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        return rows.reduce((sum, batch) => {
            const expired = batch.expiry_date && new Date(`${batch.expiry_date.slice(0, 10)}T00:00:00`) < now;
            return sum + (batch.stock_status === "available" && !expired ? Number(batch.quantity_remaining || 0) : 0);
        }, 0);
    };
    const low = inventory.filter((row) => eligibleStock(row) <= Number(row.reorder_level || 0));
    const expiringIds = new Set(batches.filter((batch) => {
        if (!batch.expiry_date || batch.stock_status !== "available" || batch.quantity_remaining <= 0) return false;
        const expires = new Date(`${batch.expiry_date.slice(0, 10)}T00:00:00`);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const days = Math.ceil((expires.getTime() - today.getTime()) / 86_400_000);
        return days >= 0 && days <= 90;
    }).map((batch) => batch.medicine_id));
    const expiring = inventory.filter((row) => expiringIds.has(row.medicine_id));
    const units = inventory.reduce((n, row) => n + eligibleStock(row), 0);

    /* ---------- derived: orders ---------- */
    const pending = orders.filter(isNew);
    const awaitingCustomer = orders.filter(isAwaitingCustomer);
    const inProgress = orders.filter((o) => ["confirmed", "processing", "ready"].includes(statusOf(o)) || isAwaitingCustomer(o));
    const completed = orders.filter(isDone);
    // Date used by the Today / Tomorrow dropdown. If your orders table has a scheduled/pickup/delivery date,
    // add it to the select() in load() and it is used automatically; otherwise created_at is used.
    const orderDay = (o: Order) => {
        const x = o as Order & { scheduled_for?: string | null; pickup_date?: string | null; delivery_date?: string | null };
        return dayKey(new Date(x.scheduled_for || x.delivery_date || x.pickup_date || o.created_at));
    };
    const dayOffset = (n: number) => {
        const d = new Date();
        d.setDate(d.getDate() + n);
        return dayKey(d);
    };
    const shownOrders = orders
        .filter((o) => (orderFilter === "delivery" ? isDelivery(o) : orderFilter === "pickup" ? isPickup(o) : true))
        .filter((o) => orderDate === "all" || orderDay(o) === dayOffset(orderDate === "today" ? 0 : orderDate === "tomorrow" ? 1 : -1));

    /* ---------- derived: earnings (completed orders only) ---------- */
    const earnings = useMemo(() => {
        const byDay = new Map<string, { total: number; count: number }>();
        completed.forEach((o) => {
            const k = dayKey(new Date(o.completed_at || o.created_at));
            const cur = byDay.get(k) || { total: 0, count: 0 };
            cur.total += Number(o.final_total || 0);
            cur.count += 1;
            byDay.set(k, cur);
        });
        const series = (n: number) =>
            Array.from({ length: n }, (_, i) => {
                const d = new Date();
                d.setDate(d.getDate() - (n - 1 - i));
                const v = byDay.get(dayKey(d));
                return { date: d, total: v?.total || 0, count: v?.count || 0 };
            });
        const sum = (n: number, offset = 0) => {
            let t = 0;
            for (let i = offset; i < offset + n; i++) {
                const d = new Date();
                d.setDate(d.getDate() - i);
                t += byDay.get(dayKey(d))?.total || 0;
            }
            return t;
        };
        const today = sum(1);
        const yesterday = sum(1, 1);
        const todayCount = byDay.get(dayKey(new Date()))?.count || 0;
        const total = completed.reduce((n, o) => n + Number(o.final_total || 0), 0);
        const discounts = completed.reduce((n, o) => n + Number(o.discount_amount || 0), 0);
        return {
            today,
            yesterday,
            todayCount,
            delta: yesterday > 0 ? ((today - yesterday) / yesterday) * 100 : null,
            week: sum(7),
            month: sum(30),
            total,
            discounts,
            avg: completed.length ? total / completed.length : 0,
            series,
            deliveryTotal: completed.filter(isDelivery).reduce((n, o) => n + Number(o.final_total || 0), 0),
            pickupTotal: completed.filter(isPickup).reduce((n, o) => n + Number(o.final_total || 0), 0),
        };
    }, [completed]);

    /* ---------- derived: customers ---------- */
    const customers = useMemo(() => {
        const m = new Map<string, { key: string; name: string; phone: string; orders: number; spent: number; last: string }>();
        orders.forEach((o) => {
            const key = o.customer_phone || o.customer_name || o.id;
            const c = m.get(key) || { key, name: o.customer_name || "Customer", phone: o.customer_phone || "", orders: 0, spent: 0, last: o.created_at };
            c.orders += 1;
            if (isDone(o)) c.spent += Number(o.final_total || 0);
            if (new Date(o.created_at) > new Date(c.last)) c.last = o.created_at;
            m.set(key, c);
        });
        return [...m.values()]
            .map((c) => {
                const days = Math.floor((Date.now() - new Date(c.last).getTime()) / 86_400_000);
                const type = c.orders >= 3 ? (days > 30 ? "At risk" : "Regular") : c.orders === 2 ? (days > 30 ? "At risk" : "Returning") : "New";
                return { ...c, days, type };
            })
            .sort((a, b) => b.spent - a.spent);
    }, [orders]);
    const refillDue = customers.filter((c) => c.orders > 0 && c.spent > 0 && c.phone && c.days >= refillDays);
    const refillLink = (c: { name: string; phone: string }) => {
        const digits = c.phone.replace(/\D/g, "");
        const num = digits.length === 10 ? `91${digits}` : digits;
        const text = `Hi ${c.name}, this is ${pharmacy?.name || "your pharmacy"}. It may be time to refill your medicines. Reply here to place a new order.`;
        return `https://wa.me/${num}?text=${encodeURIComponent(text)}`;
    };
    const repeatPct = customers.length ? Math.round((customers.filter((c) => c.orders > 1).length / customers.length) * 100) : 0;
    const newThisMonth = customers.filter((c) => c.orders === 1 && c.days <= 30).length;
    const filteredCustomers = customers.filter((c) => {
        const q = custQuery.trim().toLowerCase();
        return !q || c.name.toLowerCase().includes(q) || c.phone.includes(q);
    });

    /* ---------- misc ---------- */
    const verified = pharmacy?.verification_status === "approved";
    const canAcceptRequests = verified && pharmacy?.is_active === true;
    const initials = (pharmacy?.name || "P").trim().slice(0, 1).toUpperCase();
    const hour = new Date().getHours();
    const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
    const offeredPrescriptionCount = prescriptionOffers.filter((offer) => offer.status === "offered").length;
    const activePrescriptionCount = prescriptionOrders.filter((request) => request.status === "accepted").length;
    const prescriptionWorkCount = offeredPrescriptionCount + activePrescriptionCount;
    const offeredOffers = prescriptionOffers.filter((offer) => offer.status === "offered");
    const liveOffers = offeredOffers.filter((offer) => offerDeadline(offer) > now).sort((a, b) => offerDeadline(a) - offerDeadline(b));
    const ringingOffer = canAcceptRequests ? liveOffers[0] : undefined;

    /* ---- new ORDER alert: same 30-second countdown and repeating ring as prescription requests ---- */
    const orderDeadline = (o: Order) => (orderSeenRef.current.get(o.id) ?? 0) + ORDER_ALERT_MS;
    useEffect(() => {
        knownOrderIdsRef.current = new Set(orders.map((o) => o.id));
        if (loading) return;
        const seen = orderSeenRef.current;
        const t = Date.now();
        orders.forEach((o) => {
            if (!isNew(o) || seen.has(o.id)) return;
            if ((o as Order & { prescription_order_id?: string | null }).prescription_order_id) return; // already handled as a prescription request
            if (ordersReadyRef.current) { seen.set(o.id, t); return; } // arrived while the dashboard was open
            const age = t - new Date(o.created_at).getTime();
            if (age >= 0 && age < ORDER_ALERT_MS) seen.set(o.id, t - age); // placed seconds before this page loaded
            else { seen.set(o.id, 0); missedOrdersRef.current.add(o.id); } // old pending order: no alert
        });
        ordersReadyRef.current = true;
        setNow(Date.now());
    }, [orders, loading]);
    const liveOrders = pending
        .filter((o) => !dismissedOrders.includes(o.id) && orderDeadline(o) > now)
        .sort((a, b) => orderDeadline(a) - orderDeadline(b));
    const ringingOrder = canAcceptRequests && !ringingOffer ? liveOrders[0] : undefined;
    useEffect(() => {
        if (!canAcceptRequests) return;
        pending.forEach((o) => {
            if (!orderSeenRef.current.has(o.id) || orderDeadline(o) > now || missedOrdersRef.current.has(o.id) || dismissedOrders.includes(o.id)) return;
            missedOrdersRef.current.add(o.id);
            toast.warning("A new order was not answered in 30 seconds", { description: "It is still waiting in Orders." });
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [now, orders, canAcceptRequests, dismissedOrders]);

    /* countdown clock, only while something is waiting */
    useEffect(() => {
        if (!offeredOffers.length && !pending.length) return;
        setNow(Date.now());
        return startTicker(250, () => setNow(Date.now()));
    }, [offeredOffers.length, pending.length]);

    /* browsers block sound until the page is touched once: unlock audio on the first click or key press while on duty */
    useEffect(() => {
        if (!canAcceptRequests) return;
        const unlock = () => { primeAudio(); };
        window.addEventListener("pointerdown", unlock, { once: true });
        window.addEventListener("keydown", unlock, { once: true });
        return () => {
            window.removeEventListener("pointerdown", unlock);
            window.removeEventListener("keydown", unlock);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [canAcceptRequests]);

    /* show a clear warning when the browser is still blocking sound */
    useEffect(() => {
        if (!canAcceptRequests || !notificationSound) {
            setAudioBlocked(false);
            return;
        }
        const check = () => setAudioBlocked(audioContextRef.current?.state !== "running");
        check();
        return startTicker(1000, check);
    }, [canAcceptRequests, notificationSound]);

    /* not answered within 30 seconds: pass it to the next pharmacy */
    useEffect(() => {
        if (!canAcceptRequests) return;
        offeredOffers.forEach((offer) => {
            if (offerDeadline(offer) > now || autoPassedRef.current.has(offer.id)) return;
            autoPassedRef.current.add(offer.id);
            void rejectPrescription(offer.id, true);
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [now, prescriptionOffers, canAcceptRequests]);

    /* ring, vibrate and flash the tab title while a request is on screen */
    useEffect(() => {
        if (!ringingOffer && !ringingOrder) return;
        const buzz = () => {
            playRing();
            try { navigator.vibrate?.([250, 120, 250]); } catch { /* not supported */ }
        };
        if (Date.now() - lastRingAtRef.current > 1200) buzz(); // the realtime alert may have just rung
        const stopTicker = startTicker(ALERT_REPEAT_MS, buzz);
        const original = document.title;
        document.title = ringingOffer ? "● New request · CareNexa" : "● New order · CareNexa";
        return () => {
            stopTicker();
            document.title = original;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ringingOffer?.id, ringingOrder?.id, playRing]);

    /* safety net next to realtime: check for new nearby requests every 10 seconds while on duty */
    useEffect(() => {
        if (!pharmacy?.id || !canAcceptRequests) return;
        let cancelled = false;
        const poll = async () => {
            try {
                const { data } = await requireSupabase()
                    .from("prescription_offers")
                    .select("id,prescription_order_id,pharmacy_id,round_number,distance_km,fulfillment_choice,status,expires_at,created_at")
                    .eq("pharmacy_id", pharmacy.id)
                    .in("status", ["offered", "accepted"])
                    .order("created_at", { ascending: false });
                if (!cancelled && data) setPrescriptionOffers(data as PrescriptionOffer[]);
            } catch {
                /* the next tick tries again */
            }
        };
        /* safety net for new orders in case the realtime message is missed: a tiny check every 5 seconds, full reload only when an unknown order appears */
        const checkOrders = async () => {
            try {
                const { data } = await requireSupabase()
                    .from("orders")
                    .select("id")
                    .eq("pharmacy_id", pharmacy.id)
                    .order("created_at", { ascending: false })
                    .limit(20);
                if (cancelled || !data) return;
                if (data.some((row: { id: string }) => !knownOrderIdsRef.current.has(row.id))) void refreshDashboardRef.current?.(false);
            } catch {
                /* the next tick tries again */
            }
        };
        const stopPoll = startTicker(10_000, () => void poll());
        const stopOrders = startTicker(5_000, () => void checkOrders());
        return () => {
            cancelled = true;
            stopPoll();
            stopOrders();
        };
    }, [pharmacy?.id, canAcceptRequests]);

    const nav: Array<[Exclude<Tab, "inventory">, string, typeof LayoutDashboard, number]> = [
        ["overview", "Overview", LayoutDashboard, 0],
        ["distributors", "Distributors", Store, 0],
        ["orders", "Orders", ClipboardList, pending.length + prescriptionWorkCount],
        ["customers", "Customers", Users, 0],
        ["earnings", "Earnings", Wallet, 0],
        ["sounds", "Alert sounds", Volume2, 0],
        ["profile", "Pharmacy profile", Building2, 0],
    ];
    const titles: Record<Exclude<Tab, "inventory">, [string, string]> = {
        overview: [`${greeting}, ${pharmacy?.name || "there"}`, "A quick look at your store today. Open a section for details."],
        distributors: ["Distributors", "Manage this pharmacy’s suppliers, share common contacts, place purchase orders, and record deliveries."],
        orders: ["Orders & requests", "Accept new requests, pack them and hand them over."],
        customers: ["Customers", "Know who buys from you and bring regular customers back."],
        earnings: ["Your earnings", "Sales from completed orders, day by day."],
        sounds: ["Alert sounds", "Pick the sound that rings when a new order or request arrives."],
        profile: ["Pharmacy profile", "Review your pharmacy information and verification status."],
    };
    const inventoryTitles: Record<InventorySection, [string, string]> = {
        overview: ["Inventory overview", "Live stock, expiry alerts, and recent inventory activity."],
        medicines: ["All medicines", "Search and manage medicines stocked at this pharmacy."],
        purchase: ["Purchase / Add Stock", "Add catalogue medicines or confirm received stock."],
        batches: ["Batch management", "Review received batches, expiry, and eligible stock status."],
        "low-stock": ["Low stock", "Plan replenishment using each medicine’s configured reorder level."],
        expiry: ["Expiry management", "Find approaching or expired batches and record controlled actions."],
        history: ["Stock history", "Review purchases, sales, adjustments, and other recorded movements."],
        "import-export": ["Import / Export", "Preview catalogue CSV imports and export current inventory."],
    };
    const [pageTitle, pageDescription] = tab === "inventory" ? inventoryTitles[inventorySection] : titles[tab];

    async function signOut() {
        try {
            const { error: signOutError } = await requireSupabase().auth.signOut({ scope: "local" });
            if (signOutError) throw signOutError;
            navigate("/account", { replace: true });
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "Could not sign out. Please try again.");
        }
    }

    /* ================= render ================= */
    return (
        <main className="min-h-screen bg-[#f4f7f5] text-slate-900">
            {/* top bar */}
            <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 shadow-sm backdrop-blur">
                <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-4 px-4 py-3 md:px-7">
                    <Link to="/" className="flex min-w-0 items-center gap-2 text-sm font-extrabold sm:text-base">
                        <span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-600 text-white">
                            <Pill size={19} />
                        </span>
                        CareNexa
                        <span className="ml-2 hidden rounded-md bg-emerald-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-700 sm:inline">Partner portal</span>
                    </Link>
                    <div className="flex shrink-0 items-center gap-2 sm:gap-3">
                        <button onClick={togglePrescriptionSound} aria-pressed={notificationSound} className={`inline-flex min-h-[42px] items-center gap-2 rounded-xl border px-3 text-xs font-bold ${notificationSound ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`} title={notificationSound ? "Mute order alerts" : "Enable order and prescription alert sound"}>
                            <Bell size={16} /> <span className="hidden sm:inline">{notificationSound ? "Sound on" : "Enable sound"}</span>
                        </button>
                        <button onClick={load} className="grid h-11 w-11 place-items-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50" title="Refresh dashboard" aria-label="Refresh dashboard">
                            <RefreshCw size={17} />
                        </button>
                        <div className="hidden text-right sm:block">
                            <p className="max-w-40 truncate text-sm font-bold">{pharmacy?.name || "Pharmacy account"}</p>
                            <p className="text-[11px] text-slate-500">{pharmacy?.verification_status || "Account"}</p>
                        </div>
                        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-emerald-100 font-extrabold text-emerald-800">{initials}</div>
                        <button onClick={signOut} className="inline-flex min-h-[42px] items-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-bold text-slate-600 hover:bg-slate-50" aria-label="Sign out">
                            <LogOut size={16} /><span className="hidden sm:inline">Sign out</span>
                        </button>
                    </div>
                </div>
                <nav aria-label="Pharmacy sections" className="mx-auto flex max-w-[1500px] gap-1 overflow-x-auto border-t border-slate-100 px-4 py-2 md:px-7">
                    {nav.filter(([id]) => id === "overview").map(([id, label, Icon, badge]) => (
                        <button key={id} onClick={() => go(id)} aria-current={tab === id ? "page" : undefined} className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-xl px-3 text-sm font-semibold ${tab === id ? "bg-emerald-50 text-emerald-800" : "text-slate-600 hover:bg-slate-50"}`}>
                            <Icon size={17} />{label}{badge > 0 && <span className="rounded-full bg-rose-500 px-2 py-0.5 text-[11px] font-bold text-white">{badge}</span>}
                        </button>
                    ))}
                    <button type="button" onClick={() => go("inventory")} aria-current={tab === "inventory" ? "page" : undefined} aria-expanded={tab === "inventory"} className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-xl px-3 text-sm font-semibold ${tab === "inventory" ? "bg-emerald-50 text-emerald-800" : "text-slate-600 hover:bg-slate-50"}`}>
                        <Boxes size={17} />Inventory{low.length + expiring.length > 0 && <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[11px] font-bold text-white">{low.length + expiring.length}</span>}
                    </button>
                    {nav.filter(([id]) => id !== "overview").map(([id, label, Icon, badge]) => (
                        <button key={id} onClick={() => go(id)} aria-current={tab === id ? "page" : undefined} className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-xl px-3 text-sm font-semibold ${tab === id ? "bg-emerald-50 text-emerald-800" : "text-slate-600 hover:bg-slate-50"}`}>
                            <Icon size={17} />{label}{badge > 0 && <span className="rounded-full bg-rose-500 px-2 py-0.5 text-[11px] font-bold text-white">{badge}</span>}
                        </button>
                    ))}
                </nav>
                {tab === "inventory" && (
                    <div className="border-t border-slate-100 bg-slate-50/70">
                        <div role="group" aria-label="Inventory pages" className="mx-auto flex max-w-[1500px] gap-2 overflow-x-auto px-4 py-2 md:px-7">
                            {INVENTORY_NAV.map(([section, label]) => (
                                <button key={section} type="button" data-inventory-item="true" onClick={() => goInventory(section)} onKeyDown={handleInventorySubmenuKeyDown} aria-current={inventorySection === section ? "page" : undefined} className={`min-h-9 shrink-0 rounded-lg px-3 text-xs font-semibold ${inventorySection === section ? "bg-emerald-700 text-white" : "bg-white text-slate-600 hover:bg-emerald-50 hover:text-emerald-800"}`}>
                                    {label}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </header>

            <div className="mx-auto max-w-[1500px] px-4 py-5 md:px-7 md:py-7">
                {audioBlocked && (
                    <div role="alert" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900">
                        <span>Your browser is blocking order sound. New orders will not ring until you turn it on.</span>
                        <button type="button" onClick={() => { primeAudio(); playRing(true); }} className="min-h-[44px] rounded-xl bg-amber-600 px-4 font-extrabold text-white hover:bg-amber-700">Turn on sound</button>
                    </div>
                )}
                {tab !== "overview" && (
                    <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-100 bg-white px-4 py-3 shadow-sm">
                        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
                            <div className="flex items-center gap-3">
                                <span className={`inline-flex items-center gap-2 font-extrabold ${pharmacy?.is_active ? "text-emerald-800" : "text-slate-600"}`}>
                                    <span className={`h-2.5 w-2.5 rounded-full ${pharmacy?.is_active ? "bg-emerald-500" : "bg-slate-400"}`} />
                                    {pharmacy?.is_active ? "On duty" : "Off duty"}
                                </span>
                                <button
                                    type="button"
                                    role="switch"
                                    aria-checked={pharmacy?.is_active === true}
                                    aria-label={pharmacy?.is_active ? "Go off duty" : "Go on duty"}
                                    title={!verified ? "Your pharmacy must be approved to go on duty" : undefined}
                                    disabled={!verified || dutyBusy}
                                    onClick={() => void setPharmacyDuty(!pharmacy?.is_active)}
                                    className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${pharmacy?.is_active ? "bg-emerald-600" : "bg-slate-300"}`}
                                >
                                    <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${pharmacy?.is_active ? "translate-x-6" : "translate-x-1"}`} />
                                </button>
                                {!verified && <span className="text-xs text-amber-700">Approval required</span>}
                            </div>
                            <span className={`text-xs font-bold ${verified ? "text-emerald-700" : "text-amber-700"}`}>{verified ? "Verified" : `Verification ${pharmacy?.verification_status || "pending"}`}</span>
                            <span className="text-slate-500"><b className="text-slate-900">{pending.length}</b> new order{pending.length === 1 ? "" : "s"}</span>
                            <span className="text-slate-500"><b className="text-slate-900">{prescriptionWorkCount}</b> prescription request{prescriptionWorkCount === 1 ? "" : "s"}</span>
                        </div>
                        <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold ${notificationSound ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>
                            <Bell size={14} /> Request sound {notificationSound ? "on" : "off"}
                        </span>
                    </div>
                )}
                <section className="min-w-0">
                    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
                        <div>
                            <p className="text-xs font-extrabold uppercase tracking-[.18em] text-emerald-700">{tab === "inventory" ? "Inventory" : tab === "overview" ? "Overview" : tab === "distributors" ? "Distributors" : tab}</p>
                            <h1 className="mt-2 text-3xl font-extrabold tracking-tight md:text-4xl">{pageTitle}</h1>
                            <p className="mt-2 text-sm text-slate-500">{pageDescription}</p>
                        </div>
                        {tab === "overview" && verified && (
                            <div className="flex flex-wrap gap-2">
                                <button onClick={() => goInventory("purchase")} className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-bold text-white hover:bg-emerald-700">
                                    <Plus size={16} /> Add stock / record sale
                                </button>
                            </div>
                        )}
                    </div>

                    {error && (
                        <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
                            <div className="flex items-start gap-3">
                                <CircleAlert className="mt-0.5 shrink-0" size={20} />
                                <div>
                                    <p className="font-bold">Dashboard needs attention</p>
                                    <p className="mt-1">{error}</p>
                                    {!pharmacy && (error.toLowerCase().includes("sign in")
                                        ? <Link to="/account" className="mt-3 inline-block font-bold underline">Sign in to your pharmacy account</Link>
                                        : <Link to="/pharmacy-onboarding" className="mt-3 inline-block font-bold underline">Complete pharmacy registration</Link>)}
                                </div>
                            </div>
                        </div>
                    )}

                    {loading ? (
                        <div className="rounded-2xl border bg-white p-12 text-center text-slate-500">Loading live pharmacy data…</div>
                    ) : (
                        pharmacy && (
                            <>
                                {!verified && (
                                    <div className="mb-5 flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
                                        <div className="flex gap-3">
                                            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-800"><Clock3 size={20} /></div>
                                            <div>
                                                <p className="font-bold text-amber-950">Your pharmacy is {pharmacy.verification_status || "pending review"}</p>
                                                <p className="mt-1 text-sm text-amber-800">Complete document verification. Customers should only see pharmacies after admin approval.</p>
                                            </div>
                                        </div>
                                        <button onClick={() => go("profile")} className="min-h-[44px] rounded-xl border border-amber-300 bg-white px-4 text-sm font-bold text-amber-900">View profile</button>
                                    </div>
                                )}

                                {/* ======================= OVERVIEW ======================= */}
                                {/* ======================= OVERVIEW ======================= */}
                                {tab === "overview" && <PharmacyOverview
                                    pharmacy={pharmacy}
                                    verified={verified}
                                    dutyBusy={dutyBusy}
                                    setPharmacyDuty={setPharmacyDuty}
                                    notificationSound={notificationSound}
                                    togglePrescriptionSound={togglePrescriptionSound}
                                    primeAudio={primeAudio}
                                    playRing={playRing}
                                    pending={pending}
                                    offeredPrescriptionCount={offeredPrescriptionCount}
                                    activePrescriptionCount={activePrescriptionCount}
                                    earnings={earnings}
                                    offeredOffers={offeredOffers}
                                    now={now}
                                    busyOrder={busyOrder}
                                    canAcceptRequests={canAcceptRequests}
                                    claimPrescription={claimPrescription}
                                    rejectPrescription={rejectPrescription}
                                    go={go}
                                    setQuoteOrder={setQuoteOrder}
                                    setQuoteDiscount={setQuoteDiscount}
                                    setQuoteMessage={setQuoteMessage}
                                    setOrderStatus={setOrderStatus}
                                    inventory={inventory}
                                    units={units}
                                    low={low}
                                    expiring={expiring}
                                    awaitingCustomer={awaitingCustomer}
                                    orders={orders}
                                    inProgress={inProgress}
                                    customers={customers}
                                    repeatPct={repeatPct}
                                    money={money}
                                    timeAgo={timeAgo}
                                />}
                                {tab === "inventory" && (
                                    <PharmacyInventoryWorkspace
                                        pharmacyId={pharmacy.id}
                                        inventory={inventory}
                                        batches={batches}
                                        purchases={purchases}
                                        movements={stockMovements}
                                        section={inventorySection}
                                        canManage={verified}
                                        onNavigate={goInventory}
                                        onCreateDistributorOrder={(medicineId, quantity) => goDistributors(medicineId, quantity)}
                                        onReload={() => load(false)}
                                        onLoadMoreMovements={loadMoreMovements}
                                        hasMoreMovements={hasMoreMovements}
                                    />
                                )}

                                {tab === "distributors" && (
                                    <DistributorManagement
                                        pharmacyId={pharmacy.id}
                                        canManage={verified}
                                        initialMedicineId={new URLSearchParams(location.search).get("medicineId") || undefined}
                                        initialQuantity={Number(new URLSearchParams(location.search).get("quantity") || 0) || undefined}
                                        onInventoryRefresh={() => load(false)}
                                    />
                                )}

                                {/* ======================= ORDERS ======================= */}
                                {/* ======================= ORDERS ======================= */}
                                {tab === "orders" && (
                                    <PharmacyOrders
                                        prescriptionOrders={prescriptionOrders}
                                        prescriptionOffers={prescriptionOffers.filter((offer) => offer.status === "offered")}
                                        orders={orders}
                                        inventory={inventory}
                                        busyOrder={busyOrder}
                                        canAcceptRequests={canAcceptRequests}
                                        claimPrescription={claimPrescription}
                                        rejectPrescription={rejectPrescription}
                                        releasePrescription={releasePrescription}
                                        quotePrescription={quotePrescription}
                                        now={now}
                                        money={money}
                                        clock={clock}
                                        offerDeadline={offerDeadline}
                                        orderFilter={orderFilter}
                                        setOrderFilter={setOrderFilter}
                                        orderDate={orderDate}
                                        setOrderDate={setOrderDate}
                                        orderView={orderView}
                                        setOrderView={setOrderView}
                                        refillDue={refillDue}
                                        refillDays={refillDays}
                                        setRefillDays={setRefillDays}
                                        refillLink={refillLink}
                                        shownOrders={shownOrders}
                                        onQuote={(order) => { setQuoteOrder(order); setQuoteDiscount("0"); setQuoteMessage(""); }}
                                        onOrderStatus={setOrderStatus}
                                        timeAgo={timeAgo}
                                    />
                                )}
                                {/* ======================= CUSTOMERS ======================= */}
                                {tab === "customers" && (
                                    <PharmacyCustomers
                                        customers={customers}
                                        query={custQuery}
                                        onQueryChange={setCustQuery}
                                        money={money}
                                        averageOrder={earnings.avg}
                                    />
                                )}
                                {/* ======================= EARNINGS ======================= */}
                                {tab === "earnings" && (
                                    <PharmacyEarnings
                                        earnings={earnings}
                                        completedCount={completed.length}
                                        customers={customers}
                                        range={range}
                                        onRangeChange={setRange}
                                        money={money}
                                    />
                                )}
                                {tab === "sounds" && <PharmacySounds notificationSound={notificationSound} onToggleSound={togglePrescriptionSound} onPreview={previewSound} />}
                                {/* ======================= PROFILE ======================= */}
                                {tab === "profile" && pharmacy && <PharmacyProfile pharmacy={pharmacy} verified={verified} />}
                                {tab === "profile" && <PharmacyMembership />}
                            </>
                        )
                    )}
                </section>
            </div>
            {ringingOffer && (
                <IncomingRequestAlert
                    offer={ringingOffer}
                    now={now}
                    busy={busyOrder === ringingOffer.id}
                    soundOn={notificationSound}
                    onEnableSound={togglePrescriptionSound}
                    onAccept={() => void claimPrescription(ringingOffer.id)}
                    onPass={() => void rejectPrescription(ringingOffer.id)}
                />
            )}
            {ringingOrder && (
                <IncomingOrderAlert
                    customerName={ringingOrder.customer_name || "Customer"}
                    fulfillment={isDelivery(ringingOrder) ? "Home delivery" : isPickup(ringingOrder) ? "Store pickup" : "New order"}
                    itemCount={ringingOrder.items?.length || 0}
                    total={money(Number(ringingOrder.subtotal))}
                    secondsLeft={Math.max(0, Math.ceil((orderDeadline(ringingOrder) - now) / 1000))}
                    totalSeconds={ORDER_ALERT_MS / 1000}
                    soundOn={notificationSound}
                    onEnableSound={togglePrescriptionSound}
                    onOpen={() => { setDismissedOrders((c) => [...c, ringingOrder.id]); go("orders"); }}
                    onDismiss={() => setDismissedOrders((c) => [...c, ringingOrder.id])}
                />
            )}
            {quoteOrder && (
                <OrderQuoteModal
                    order={quoteOrder}
                    discount={quoteDiscount}
                    onDiscountChange={setQuoteDiscount}
                    message={quoteMessage}
                    onMessageChange={setQuoteMessage}
                    busy={busyOrder === quoteOrder.id}
                    money={money}
                    onClose={() => setQuoteOrder(null)}
                    onSubmit={() => void sendQuote()}
                />
            )}        </main>
    );
}

/* ================= small components ================= */