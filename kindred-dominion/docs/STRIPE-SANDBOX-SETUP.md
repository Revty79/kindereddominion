# Stripe sandbox setup

Live payments remain disabled. Simulation results are not actual sales or genuine Stripe verification. Complete the independent fulfillment tests before genuine sandbox acceptance. No dashboard products or webhook endpoints need to be created manually for local CLI forwarding.

From `D:\kindereddominion\kindred-dominion`:

```powershell
npm run commerce:configure
notepad server/.env.local
```

The exact private credential file is `D:\kindereddominion\kindred-dominion\server\.env.local`. Git ignores this file. Preserve its existing database and session settings. Enter the sandbox secret or restricted key on `STRIPE_SECRET_KEY=`; optionally enter the test publishable key on `STRIPE_PUBLISHABLE_KEY=`. Hosted Checkout does not need that public key. Leave `COMMERCE_MODE=disabled` until account verification, webhook forwarding and reviewed catalog publication are ready. Never paste keys in chat or a command argument. Never use `sk_live_`, `rk_live_` or `pk_live_`; configuration rejects them even with checkout disabled. Production rejects all enabled commerce modes.

Prefer a restricted `rk_test_` runtime key. The implemented calls need Account read, Balance read, Checkout Sessions read/write, Products read, Prices read, Payment Intents read and Charges read. Event investigation needs Events read; refund/dispute operations require Refunds read/write and Disputes read. Stripe may group these permissions differently in its restricted-key interface. Grant only the corresponding resources; Payouts, bank accounts and Connect account management are unnecessary. Use a separate setup-only key with Products/Prices write on `STRIPE_CATALOG_SECRET_KEY=` where practical; remove it after catalog setup. If a restricted key is denied, review the missing resource privately rather than printing provider errors or granting every permission.

```powershell
npm.cmd run commerce:verify -- --pin-account
```

This checks the current account and test balance, then privately saves its non-secret `acct_` identity on `STRIPE_ACCOUNT_ID=`. Subsequent connections must match it. It does not connect to PostgreSQL or grant assets. Failure output is sanitized. The optional publishable key must belong to the same sandbox; the server does not use it for authorization. In Windows PowerShell, use `npm.cmd` when forwarding script flags: this machine's `npm.ps1` invocation rejected `--pin-account`, while `npm.cmd` and the compiled equivalent below passed. Do not change global npm configuration to work around it.

Install the official CLI once (or use the official Windows installer):

```powershell
npm install --prefix .local/stripe-cli --no-save --package-lock=false @stripe/cli@1.55.15
npm run commerce:listen
```

The wrapper uses the official native platform binary, passes the private sandbox key through the child environment and captures the signing secret without printing it. It writes `STRIPE_WEBHOOK_SECRET=` into the same ignored environment file, then forwards the explicitly supported test events to `http://127.0.0.1:<API_PORT>/api/commerce/stripe/webhook`. No database or session secrets are passed to the CLI. Keep this terminal running. Do not invoke raw CLI commands that print the signing secret or put a key in command arguments. Restart the isolated backend after the secret is saved so it loads the updated value. A changing public tunnel can break a previously issued browser return URL; CLI loopback delivery and saved purchase history remain the recovery path. Never expose the protected Control interface merely to receive webhooks.

Use a disposable isolated database copy and a permanently sandbox-designated account for acceptance. In protected Control, explicitly review and publish economy, shop and commercial configuration, then prepare the matching provider catalog:

```powershell
npm run commerce:catalog
npm.cmd run commerce:catalog -- --apply
```

The first command is a dry run. The second creates immutable sandbox Products and Prices for the exact published configuration, verifies them and records mappings. Repetition reuses the same objects. Publishing a new version creates new revision-specific mappings; old order terms remain pinned. Do not edit old Stripe Prices to change settled terms.

Set `COMMERCE_MODE=stripe_sandbox` only in the isolated acceptance environment and restart its backend. Checkout additionally requires the privately pinned account, webhook secret, test key, economy opt-in, published enabled commercial catalog and permanent sandbox account. Verify successful/declined/cancelled payments, signed delivery, duplicate events, exactly-once assets, receipt/history, refunds and disputes using Stripe's documented test methods. A browser success return alone never proves payment. Keep genuine-provider results separate from deterministic simulations. Disable checkout again after testing.

Back up the private environment separately in secure owner-controlled storage; never add it to a source bundle, Git, report, screenshot or support transcript. Rotate compromised keys in Stripe, update the private file and restart only the authorized isolated service. Database recovery uses the existing paired backup/isolated restore procedures; credentials are restored separately. Hosted TEST acceptance and `sudo kindred-update` remain owner operations. No production or real-money activation is authorized.

Primary references: [restricted keys](https://docs.stripe.com/keys/restricted-api-keys), [key handling](https://docs.stripe.com/keys-best-practices), [CLI forwarding](https://docs.stripe.com/cli/listen), [Checkout fulfillment](https://docs.stripe.com/checkout/fulfillment?ui=full-page), [webhook signatures](https://docs.stripe.com/webhooks), [official CLI installation](https://github.com/stripe/stripe-cli#installation). [Genuine local sandbox acceptance](V1.5F-STRIPE-SANDBOX-VALIDATION.md) passed on November 27 after the owner supplied credentials privately. Hosted configuration and real-money activation remain separate; repeat acceptance for a new environment or materially changed implementation.

## Compiled and hosted tooling

The runtime image includes `server-dist/commerce-tools.mjs`; it does not need tsx or development dependencies. Locally the compiled equivalents are:

```powershell
node server-dist/commerce-tools.mjs verify --pin-account
node server-dist/commerce-tools.mjs catalog
node server-dist/commerce-tools.mjs catalog --apply
```

For optional hosted TEST sandbox acceptance, the owner edits `/etc/kindred-dominion/test/backend.env` privately with `sudoedit`, preserving every existing setting. Use the same `STRIPE_SECRET_KEY`, `STRIPE_ACCOUNT_ID`, `STRIPE_WEBHOOK_SECRET`, optional `STRIPE_PUBLISHABLE_KEY` and temporary `STRIPE_CATALOG_SECRET_KEY` names. Keep `COMMERCE_MODE=disabled` until verification is ready. Never put Stripe credentials in `migrations.env`, source CI, build arguments or isolated updater rehearsal containers. Routine application updates remain only `sudo kindred-update`; no operator reinstall is required.

Use `sudo kindred-restart` after an explicitly reviewed private runtime change. The compiled command can be executed in the **already running** backend by exact container identity, obtained from `docker ps --filter label=com.docker.compose.project=kindred-dominion --filter label=com.docker.compose.service=backend --format '{{.ID}}'`. There must be exactly one match; otherwise stop and investigate. Then run `sudo docker exec <BACKEND_CONTAINER_ID> node server-dist/commerce-tools.mjs verify` and the same command with `catalog`, then `catalog --apply` after reviewing the dry run. Do not use `--pin-account` in a container: it cannot rewrite the private host file. Privately enter the verified non-secret account ID in that file instead. Container arguments contain no keys. Remove the catalog write key after setup and restart the authorized runtime again.

CLI forwarding is a local acceptance tool. Hosted webhook registration requires a stable owner-approved public HTTPS webhook URL, the listed supported events and a signing secret entered privately in `backend.env`. A temporary tunnel address is not a durable registration. Never replace its secret with a local CLI secret. Saved orders remain recoverable through verified reconciliation; a changing browser return URL cannot authorize a grant. This hosted configuration remains an owner task and was not performed on homeserver.
