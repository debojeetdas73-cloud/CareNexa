import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import OrderMedicineList from "@/components/pharmacy/OrderMedicineList";
import OrderQuoteModal from "@/components/pharmacy/OrderQuoteModal";
import type { Order, OrderItem } from "@/components/pharmacy/types";

const medicineItem: OrderItem = {
    id: "item-1",
    order_id: "order-1",
    medicine_id: "medicine-1",
    quantity: 1,
    unit_selling_price: 30,
    line_total: 30,
    medicine: {
        id: "medicine-1",
        name: "Metformin hydrochloride",
        generic_name: "Metformin",
        brand_name: null,
        strength: "500 mg",
        dosage_form: "Tablet",
    },
};

const order: Order = {
    id: "order-1",
    order_number: null,
    status: "pending",
    customer_name: "Customer",
    customer_phone: "9999999999",
    subtotal: 30,
    final_total: null,
    discount_amount: null,
    created_at: "2026-10-30T00:00:00.000Z",
    fulfillment_choice: "pickup",
    delivery_address: null,
    quote_sent_at: null,
    customer_accepted_quote_at: null,
    quote_message: null,
    prescription_order_id: null,
    completed_at: null,
    items: [medicineItem],
};

const money = (value: number) => `₹${value.toFixed(2)}`;

describe("pharmacy order medicine details", () => {
    it("shows the medicine fields and generated item total", () => {
        render(<OrderMedicineList items={[medicineItem]} money={money} />);

        expect(screen.getByText("Metformin hydrochloride")).toBeInTheDocument();
        expect(screen.getByText("Strength: 500 mg | Form: Tablet")).toBeInTheDocument();
        expect(screen.getByText("Quantity: 1 × ₹30.00")).toBeInTheDocument();
        expect(screen.getByText("Item total: ₹30.00")).toBeInTheDocument();
    });

    it("uses item totals for the subtotal and prevents discounts above it", () => {
        const onSubmit = vi.fn();
        const props = {
            order,
            discount: "5",
            onDiscountChange: vi.fn(),
            message: "",
            onMessageChange: vi.fn(),
            busy: false,
            money,
            onClose: vi.fn(),
            onSubmit,
        };
        const { rerender } = render(<OrderQuoteModal {...props} />);

        expect(screen.getByText("Subtotal").parentElement).toHaveTextContent("₹30.00");
        expect(screen.getByText("Discount").parentElement).toHaveTextContent("₹5.00");
        expect(screen.getByText("Final total").parentElement).toHaveTextContent("₹25.00");
        fireEvent.click(screen.getByRole("button", { name: "Send quote" }));
        expect(onSubmit).toHaveBeenCalledOnce();

        rerender(<OrderQuoteModal {...props} discount="31" />);
        expect(screen.getByRole("button", { name: "Send quote" })).toBeDisabled();
        expect(screen.getByRole("alert")).toHaveTextContent("Enter a discount");
    });
});
