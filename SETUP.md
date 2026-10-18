# coconotes: setup

coconotes is for two people: you and Masha. Want to look around first? Upload this folder to Vercel without changing config.js and it runs in demo mode with sample items. Nothing saves in demo mode.

Use its own Supabase project, separate from the team tracker.

## 1. Create the database (5 minutes)

1. At supabase.com, click New project. Any name, strong database password, US East region.
2. SQL Editor, New query. Open `supabase-setup.sql`, put your two real emails on the last line, paste it all, and click Run.
3. New query again. Paste `reminders.sql` and click Run. If it complains about pg_cron, go to Database, Extensions, turn on pg_cron, then run it again.

## 2. Turn off email confirmation

Authentication, Sign In / Providers, Email: switch off "Confirm email" and save. Only the two emails on your list can get in.

## 3. Connect the app

Project Settings, then API. Copy the Project URL and the anon public key into `config.js`.

## 4. Upload to Vercel

Upload the folder as you normally do. No build settings needed.

## 5. Sign in and add it to your phones

Each of you opens the link, taps "First time here? Create an account," and uses the email from step 1. On iPhone: Share, then Add to Home Screen. Always open coconotes from the home screen icon.

## 6. Notifications (15 minutes)

Reminders buzz your phone at their time. You also get a ping when the other person asks you for something, sends you something, or messages you. Needs iOS 16.4 or later, opened from the home screen.

1. Open `tools/make-push-keys.html` (after uploading: your-site/tools/make-push-keys.html) and click Make keys.
2. Paste the public key into `config.js` as VAPID_PUBLIC_KEY and re-upload.
3. Supabase, Edge Functions, Secrets. Add:
   - `VAPID_PUBLIC_KEY`: the public key
   - `VAPID_PRIVATE_KEY`: the private key (it only ever goes here)
   - `VAPID_SUBJECT`: `mailto:` plus your email, like `mailto:you@company.com`
4. Edge Functions, create a function named exactly `notify`. Paste `supabase/functions/notify/index.ts` and deploy. Leave JWT verification on.
5. Database, Webhooks, Create a new hook: name `notify`, table `activity`, event Insert, type Supabase Edge Functions, function `notify`, method POST. Turn on "Add auth header with service key" if offered.
6. Each of you: open coconotes from the home screen, tap your avatar, Turn on notifications, Allow.

Test: set a reminder for 2 minutes from now. Your phone should buzz.

## 7. Calendar sync (10 minutes, optional)

1. Edge Functions, create a function named exactly `calendar`. Paste `supabase/functions/calendar/index.ts` and deploy.
2. In its settings, turn OFF JWT verification. Calendar apps can't sign in, so each person's private link is the key.
3. Optional secret `APP_URL` with your Vercel link, so calendar entries open coconotes.
4. In coconotes: avatar, Calendar sync, Get my calendar link.

## 8. Claude key for Lock Screen notes (2 minutes, optional)

Lock Screen notes (step 9) use Claude to sort a typed note into reminders with the right date, time and brand. Create a key at console.anthropic.com > API Keys, set a small monthly limit, then in Supabase > Edge Functions > Secrets add `ANTHROPIC_API_KEY`. Without it, a Lock Screen note is saved as one reminder for today.

Command line alternative: `supabase functions deploy notify`, `supabase functions deploy calendar --no-verify-jwt`, `supabase functions deploy capture --no-verify-jwt`

## 9. Lock Screen quick capture (5 minutes, recommended)

Lets you press one button on your Lock Screen (or the Action Button, or say "Hey Siri, Coconote"), talk, and have it land in coconotes already sorted, even in the middle of a meeting.

1. Run `upgrade-3.sql` in the SQL Editor (skip if your setup already includes `capture_tokens`).
2. Edge Functions: create a function named exactly `capture`, paste `supabase/functions/capture/index.ts`, and deploy. Turn OFF JWT verification for it; your personal link is the key.
3. In coconotes: avatar, then Jot from your Lock Screen. Tap Get my capture link, then follow the on-screen steps to make the Shortcut and put it on your Lock Screen.

It uses the same `ANTHROPIC_API_KEY` from step 8 to sort your note. Without it, the note is saved as a single reminder for today.

## Already set up before this update?

Run `upgrade-4.sql` once in the SQL Editor. It turns on Notes and puts every existing reminder on both of you. (Older upgrades: `upgrade-2.sql` and `upgrade-3.sql`, only if you set up before those existed.)

Optional: paste the updated `supabase/functions/notify/index.ts` into your `notify` function and deploy, so the notification reads "Masha added a reminder."

## How coconotes works

A shared list for two. Every reminder belongs to both of you, and when one of you adds or finishes something, the other gets a heads-up.

- **Today**: what's in progress, then overdue, then today, with timed reminders in time order.
- **Upcoming**: everything with a future date, under each day's name and date. A week strip on top shows busy days; tap Month for the full calendar.
- **All**: everything, with folders on top: Calls, In progress, Urgent, No date, New messages, and one per brand.
- **Notes**: ideas and requests, jotted fast and shared. Folders per brand. The first line of a note is its title. Any note can become a reminder in one tap.
- **Adding**: type it the way you'd say it in the bar at the bottom: "call David tomorrow at 3", "send the menu Friday #LOX". On the Notes tab the same bar makes a note. Tap + for the full form.
- **Calls**: anything that starts with or mentions calling someone ("call David", "give Imperial a ring") lands in Calls. In details, the Call switch turns any reminder into a call; add a number for a one-tap call button.
- **Press and hold** a reminder: it lifts out of the list with Not started, In progress, Done, the snooze slider, Urgent, Details and Delete underneath. Swipe left for Urgent or Delete.
- **Details**: status, messages with Masha right at the top, then date, time slider, keep reminding me, call, urgent and brand.
- **Messages**: the latest message shows on the reminder's row, bold until read, and unread ones collect in New messages.
- **The bell**: what Masha added, finished or wrote, and reminders that went off.

## Logo files

`brand/` has the logo: `coconotes-logo.svg` (mark and wordmark), `coconotes-mark.svg` (mark only), and `coconotes-icon.svg` (app icon).
