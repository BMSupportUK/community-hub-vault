/** Test orders that may start video help outside opening hours (for staff testing). */
export const VIDEO_TEST_ORDER_TOKENS = new Set([
  "044e7e5e098e47ca8dee211ab121976b615d85a80e2842b7b67e84f6d21a9152",
]);
export const isVideoTestOrder = (token: string) => VIDEO_TEST_ORDER_TOKENS.has(token);
