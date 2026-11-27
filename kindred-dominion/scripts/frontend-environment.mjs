// Frontend subprocesses never need private backend/provider configuration.
export function frontendEnvironment(environment,apiTarget){
 const result={...environment,KINDRED_API_TARGET:apiTarget};
 for(const key of Object.keys(result))if(/^(?:VITE_)?(?:PG|DATABASE_|SESSION_|AUTH_|STRIPE_|COMMERCE_MODE|KINDRED_ENV_FILE)/i.test(key))delete result[key];
 return result;
}
