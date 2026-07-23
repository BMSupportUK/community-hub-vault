import { createFileRoute } from "@tanstack/react-router";
import { ReviewsPage } from "@/components/app/ReviewsPage";

export const Route = createFileRoute("/_authenticated/_approved/reviews")({
  component: ReviewsPage,
});