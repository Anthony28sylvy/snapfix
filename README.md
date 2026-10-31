# Snapfix

Photograph a home repair problem and get a diagnosis, step-by-step fix, shopping list with store links, YouTube search links and a tool for comparing pro quotes.

This is a small website plus a tiny server. The server holds your Claude API key and sends each photo to Claude, so the key never reaches visitors' browsers. It has no dependencies: you only need Node.js 20.6 or newer.

## Files

- `server.js`: serves the site and handles `POST /api/diagnose`. The prompt lives here.
- `pricing.json`: the numbers behind every estimate (hourly rates, minimum charge, shelf prices). Edit this to tune prices.
- `pricing.js`: turns Claude's answer into steady, rounded prices using `pricing.json`.
- `public/index.html` + `public/intake.js`: page 1, where people add a photo, notes and ZIP code.
- `public/results.html` + `public/results.js`: page 2, the repair plan, shown after the diagnosis finishes.
- `public/styles.css`: the look of both pages.
- `public/manifest.webmanifest`, `public/icon.svg`: let people add Snapfix to their home screen.
- `test.js`: run `npm test` to check the server. It needs no API key.

## Try it on your computer

1. Install Node.js from nodejs.org if you don't have it.
2. In this folder, run `npm run mock` and open http://localhost:3000. Mock mode returns a fake result so you can click around without an API key.
3. For real diagnoses, create an API key in the Claude Console (platform.claude.com), then copy `.env.example` to `.env`, paste the key in, and run `npm run local`.

## Put it on the internet

Any host that runs Node works (Render, Railway, Fly.io and similar). On Render, for example:

1. Put this folder in a GitHub repository. `.gitignore` already keeps `.env` out.
2. Create a new Web Service from the repository.
3. Start command: `npm start`. No build command is needed.
4. Add an environment variable `ANTHROPIC_API_KEY` with your key. Never put the key in the code.
5. Deploy, then add your own domain in the host's settings if you want one.

Keep `TRUST_PROXY` at its default on these hosts. Set `TRUST_PROXY=0` only if you run the server exposed directly to the internet.

## Show it inside Google Sites

Google Sites cannot run this server, so host it first (see above), then embed it:

1. On your host, add the environment variable `FRAME_ANCESTORS` set to `https://sites.google.com https://*.googleusercontent.com`. Without it the site refuses to appear inside other pages.
2. In Google Sites, choose Insert, then Embed, then By URL, and paste your site's address (it must start with https).
3. Resize the embed so it is tall enough, then publish the Google Site.

If the embed shows "refused to connect", open the browser's developer console and look for the blocked ancestor, then add that origin to `FRAME_ANCESTORS`. Phone cameras can be more awkward inside an embedded frame, so also link to the site's own address for phone visitors.

## Making small changes

- **Prices:** edit `pricing.json`. Change `hourlyRates` and `minimumCharge` to match real quotes in your area, and add items to `priceGuide` (names in lowercase). Claude only decides what the job is, which items it needs and how many hours it takes; the dollar amounts come from this file, so the same job shows the same prices.
- **Same answer every time:** the server remembers each answer for 7 days, keyed on the photo, notes, ZIP code and experience level. Repeating the same request returns the saved answer. The memory is cleared when the server restarts or sleeps, and any edit to `pricing.json` makes old answers be ignored.
- **Wording or looks:** text is in the `.html` files, colors and layout in `public/styles.css`. On GitHub you can open a file, click the pencil icon, edit, and Commit; Render redeploys by itself in a few minutes.
- **What Claude is told to do:** the prompt is in `server.js`. Raise `PROMPT_VERSION` after changing it so old saved answers are dropped.

## Costs and abuse protection

Every diagnosis is a paid Claude API call on your key. The server limits each visitor to `HOURLY_LIMIT` diagnoses per hour (default 12) and the whole site to `DAILY_LIMIT` per day (default 300). The counters are in memory and reset when the server restarts. Check the Console for usage and any spending limits it offers, and lower these numbers while you are testing.

Change the model with `CLAUDE_MODEL` (default `claude-sonnet-5-5`). The API version sent to Claude is `ANTHROPIC_VERSION` (default `2023-06-01`, which works with the live site). If a diagnosis fails, open the Logs tab on your host: the server prints the HTTP status and Claude's error message there, never your key.

## Before you open it to the public

- **Privacy policy.** Photos of people's homes are personal. This server does not store them, but Claude receives them. Say so plainly, and link your policy from the page.
- **Advice disclaimer.** The footer already says diagnoses are estimates and to hire a licensed pro for gas, electrical, structural and similar work. Keep it, and have a lawyer review the wording before launch.
- **Accounts.** The IP-based limits are a first line of defense only. For a real launch, add sign-in so you can limit per user.

## What is not real yet

- **Pro quotes.** The page links to Google Maps, Yelp, Angi and Thumbtack and drafts a quote request. It cannot fetch live bids. That needs partner or API agreements with those services.
- **Prices.** Tool and part prices are Claude's estimates. Live prices need a retailer product feed or affiliate API.
- **Videos.** The page links to YouTube searches. Showing specific videos inside the page needs the YouTube Data API, called from `server.js` with its own key.
- **Quote log.** Quotes people enter are saved in their own browser only.

## Turning it into a phone app

The website works as-is when added to a phone's home screen. To publish in the App Store or Google Play, wrap it with Capacitor, or rebuild the interface in React Native, and keep this server as the backend.
