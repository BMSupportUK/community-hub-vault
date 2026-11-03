import { test, expect } from "bun:test";
import { RatingVote, ratingIdentity, ratingVoter } from "./player-ratings";

test("votes allow all five whole-star scores", () => {
  for (const stars of [1, 2, 3, 4, 5]) expect(RatingVote.parse({ kind: "film", title: "Film", stars }).stars).toBe(stars);
});
test("votes reject zero, six and fractions", () => {
  for (const stars of [0, 6, 2.5]) expect(RatingVote.safeParse({ kind: "series", title: "Series", stars }).success).toBe(false);
});
test("ratings apply only to films and whole series", () => {
  for (const kind of ["live", "episode", "catchup"]) expect(RatingVote.safeParse({ kind, title: "Item", stars: 5 }).success).toBe(false);
});
test("same title shares votes across device and provider IDs", () => {
  expect(ratingIdentity("film", "  The  Film  ")).toBe(ratingIdentity("film", "the film"));
  expect(ratingIdentity("series", "The Film")).not.toBe(ratingIdentity("film", "The Film"));
  expect(ratingIdentity("film", "Film (2020)")).not.toBe(ratingIdentity("film", "Film (2021)"));
});
test("voter is linked customer, not device; unlinked device cannot vote", () => {
  expect(ratingVoter({ user_id: "customer", offsite_customer_id: null })).toBe("user:customer");
  expect(ratingVoter({ user_id: null, offsite_customer_id: "customer" })).toBe("offsite:customer");
  expect(ratingVoter({ user_id: null, offsite_customer_id: null })).toBeNull();
  expect(ratingVoter({ user_id: "customer", offsite_customer_id: "customer" })).toBeNull();
});