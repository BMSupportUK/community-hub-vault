/** Test orders that may start video help outside opening hours (for staff testing). */
export const VIDEO_TEST_ORDER_TOKENS = new Set([
  "044e7e5e098e47ca8dee211ab121976b615d85a80e2842b7b67e84f6d21a9152",
  "1e03aaef13e0572a91a400372950765bde919c2ffba5f03ec4da7b7f5eaa52f9",
]);
export const isVideoTestOrder = (token: string) => VIDEO_TEST_ORDER_TOKENS.has(token);
