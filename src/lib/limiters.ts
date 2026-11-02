import { createRateLimiter } from "./rateLimit";

const TEN_MINUTES = 10 * 60 * 1000;

export const connectLimiter = createRateLimiter(8, TEN_MINUTES);
export const sendLimiter = createRateLimiter(60, TEN_MINUTES);
export const testSendLimiter = createRateLimiter(20, TEN_MINUTES);
export const savedLimiter = createRateLimiter(240, TEN_MINUTES);
