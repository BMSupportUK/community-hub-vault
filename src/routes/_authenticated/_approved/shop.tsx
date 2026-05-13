import { createFileRoute } from "@tanstack/react-router";
import { ShoppingBag } from "lucide-react";
import { Coming } from "@/components/app/Coming";

export const Route = createFileRoute("/_authenticated/_approved/shop")({
  component: () => <Coming title="Shop" Icon={ShoppingBag} desc="Server storefront. Coming next." />,
});
