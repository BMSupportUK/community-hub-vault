import { describe, expect, test } from "bun:test";
import { pickCheapest, type CompareOffer } from "../src/lib/streaming-prices.server";

const offers: CompareOffer[] = [
  { shop: "OnBuy", url: "https://pricespy.co.uk/go-to-shop/1", priceCents: 4099, inStock: true },
  { shop: "Cheap", url: "https://pricespy.co.uk/go-to-shop/2", priceCents: 3000, inStock: false },
  { shop: "Very", url: "https://pricespy.co.uk/go-to-shop/3", priceCents: 5900, inStock: true },
];

describe("cheapest shop", () => {
  test("picks the cheapest in-stock offer, skipping out-of-stock ones", () => {
    expect(pickCheapest(offers, null)?.shop).toBe("OnBuy");
  });
  test("official store wins when its stored price is cheaper", () => {
    expect(pickCheapest(offers, { url: "https://www.mi.com/uk/x", priceCents: 3999 })?.url).toBe("https://www.mi.com/uk/x");
  });
});
