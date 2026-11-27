import type {BackendConfig} from "./config";
export function stripeSettings(env:Record<string,string|undefined>){const clean=(name:string)=>(env[name]??"").trim();const settings={secretKey:clean("STRIPE_SECRET_KEY"),publishableKey:clean("STRIPE_PUBLISHABLE_KEY"),webhookSecret:clean("STRIPE_WEBHOOK_SECRET"),accountId:clean("STRIPE_ACCOUNT_ID"),catalogSecretKey:clean("STRIPE_CATALOG_SECRET_KEY")};
 for(const key of [settings.secretKey,settings.publishableKey,settings.catalogSecretKey])if(/^(?:sk|rk|pk)_live_/.test(key))throw Error("Live Stripe credentials are prohibited. Configure sandbox credentials privately.");
 for(const key of [settings.secretKey,settings.catalogSecretKey])if(key&&!/^(?:sk|rk)_test_[A-Za-z0-9_]{8,}$/.test(key))throw Error("Stripe server credentials must be valid sandbox secret or restricted keys.");
 if(settings.publishableKey&&!/^pk_test_[A-Za-z0-9_]{8,}$/.test(settings.publishableKey))throw Error("Only sandbox publishable keys are supported.");
 if(settings.webhookSecret&&!/^whsec_[A-Za-z0-9_-]{8,}$/.test(settings.webhookSecret))throw Error("Configure the sandbox webhook signing secret privately.");
 if(settings.accountId&&!/^acct_[A-Za-z0-9]+$/.test(settings.accountId))throw Error("Configure a valid expected Stripe sandbox account identifier.");return settings;
}
export function stripeReady(config:BackendConfig){return config.environment!=="prod"&&!!config.stripe.secretKey&&!!config.stripe.accountId&&!!config.stripe.webhookSecret;}
