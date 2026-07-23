import { createLazyFileRoute } from "@tanstack/react-router";
import { ReviewsPage } from "@/components/app/ReviewsPage";

export const Route = createLazyFileRoute("/_authenticated/_approved/reviews")({
  component: ReviewsPage,
});