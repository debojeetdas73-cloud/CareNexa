import { Search, MapPin, ShoppingBag } from "lucide-react";
import { useScrollReveal } from "@/hooks/useScrollReveal";

const steps = [
  {
    icon: Search,
    title: "Search Medicine",
    description: "Type the name of any medicine you need and we'll find it for you instantly.",
  },
  {
    icon: MapPin,
    title: "Find Nearest Pharmacy",
    description: "See all nearby pharmacies that have your medicine in stock, sorted by distance.",
  },
  {
    icon: ShoppingBag,
    title: "Order & Get It",
    description: "Place your order for home delivery or walk in to pick it up — your choice.",
  },
];

const HowItWorks = () => {
  const ref = useScrollReveal();

  return (
    <section id="how-it-works" className="bg-[hsl(var(--surface-warm))] px-4 py-20 md:py-28">
      <div ref={ref} className="container mx-auto max-w-5xl">
        <div className="text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-primary">Simple Process</p>
          <h2 className="font-display mt-2 text-3xl font-bold text-foreground md:text-4xl" style={{ textWrap: "balance" }}>
            Get your medicine in 3 easy steps
          </h2>
        </div>

        <div className="mt-14 grid gap-8 md:grid-cols-3">
          {steps.map((step, i) => (
            <div
              key={step.title}
              className="group relative rounded-2xl bg-card p-8 shadow-sm transition-shadow duration-300 hover:shadow-lg"
              style={{ animationDelay: `${i * 100}ms` }}
            >
              <span className="absolute -top-3 right-6 flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                {i + 1}
              </span>
              <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors duration-300 group-hover:bg-primary group-hover:text-primary-foreground">
                <step.icon className="h-6 w-6" />
              </div>
              <h3 className="font-display text-lg font-bold text-foreground">{step.title}</h3>
              <p className="mt-2 leading-relaxed text-muted-foreground">{step.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default HowItWorks;
