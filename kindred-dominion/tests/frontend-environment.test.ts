import {describe,it,expect} from "vitest";
// @ts-expect-error The launcher is a directly executable ESM script.
import {frontendEnvironment} from "../scripts/frontend-environment.mjs";
describe("Local frontend credential isolation",()=>{
 it("removes inherited backend and Stripe secrets, including browser-prefixed variants",()=>{const input={PATH:"tools",VITE_PLAYER_CONTENT_ID:"founding",STRIPE_SECRET_KEY:"private-fixture",STRIPE_WEBHOOK_SECRET:"private-signing-fixture",VITE_STRIPE_SECRET_KEY:"bad-browser-prefixed-fixture",PGPASSWORD:"private-db-fixture",VITE_SESSION_SECRET:"private-session-fixture",KINDRED_ENV_FILE:"private-config",COMMERCE_MODE:"stripe_sandbox"};const result=frontendEnvironment(input,"http://127.0.0.1:3001");expect(result).toEqual({PATH:"tools",VITE_PLAYER_CONTENT_ID:"founding",KINDRED_API_TARGET:"http://127.0.0.1:3001"});expect(input.STRIPE_SECRET_KEY).toBe("private-fixture");});
});
