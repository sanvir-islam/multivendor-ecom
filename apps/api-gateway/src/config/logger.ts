import { createLogger } from "@multivendor-ecom/shared";

// We initialize the logger exactly ONCE in this file.
// Because it is exported, every other file in this service will share this exact instance.
export const logger = createLogger("api-gateway");
