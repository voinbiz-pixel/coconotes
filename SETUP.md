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

## 8. Smart voice understanding (5 minutes, recommended)

Without this, voice notes use a basic built-in parser. With it, Claude sorts messy speech into the right items.

1. Go to console.anthropic.com, sign up, add a payment method, and create an API key.
2. Supabase, Edge Functions, Secrets: add `ANTHROPIC_API_KEY` with that key.
3. Edge Functions, create a function named exactly `understand`. Paste `supabase/functions/understand/index.ts` and deploy. Leave JWT verification on, so only the two of you can use it.

The key never touches the app itself. Each voice note is a small request; you can set a monthly spending limit in the Anthropic console.

Command line alternative: `supabase functions deploy notify`, `supabase functions deploy understand`, `supabase functions deploy calendar --no-verify-jwt`, `supabase functions deploy capture --no-verify-jwt`

## 9. Lock Screen quick capture (5 minutes, recommended)

Lets you press one button on your Lock Screen (or the Action Button, or say "Hey Siri, Coconote"), talk, and have it land in coconotes already sorted, even in the middle of a meeting.

1. Run `upgrade-3.sql` in the SQL Editor (skip if your setup already includes `capture_tokens`).
2. Edge Functions: create a function named exactly `capture`, paste `supabase/functions/capture/index.ts`, and deploy. Turn OFF JWT verification for it; your personal link is the key.
3. In coconotes: avatar, then Jot from your Lock Screen. Tap Get my capture link, then follow the on-screen steps to make the Shortcut and put it on your Lock Screen.

It uses the same `ANTHROPIC_API_KEY` from step 8 to sort your note. Without it, the note is saved as a single reminder for today.

## Already set up before this update?

Run `upgrade-2.sql` (in-progress status and keep-reminding) and `upgrade-3.sql` (Lock Screen capture) in the SQL Editor, once each.

## How coconotes works

It works like Apple Reminders, built for two, with fixes for the things people complain about most in Reminders.

- **Today**: what's in progress, then overdue, then today, with timed reminders in time order. **Upcoming**: everything with a future date, day by day. A week strip at the top shows which days have something; tap **Month** to open a full calendar, and tap any day to jump to it or add something on it. **All**: everything, plus folders at the top: Calls, From Masha, Waiting on Masha, In progress, Urgent, No date, and one per brand.
- **You, Masha, Everyone** at the top switches whose reminders you see, on every tab.
- **Tap the circle** to complete. **Touch and hold** a reminder (or right-click on a computer) to set Not started, In progress, or Done, snooze it, mark it urgent, or delete it. A half-filled circle means in progress. **Swipe left** to mark urgent or delete.
- **Adding**: type it the way you'd say it, tap the mic and talk, or tap + for the full form. Voice notes are added right away with Undo; turn on Check before adding in the voice sheet if you'd rather review first.
- **Messages**: the latest message on a reminder shows right on its row, bold until you read it. Unread ones also collect in the New messages folder on All.
- **Times**: pick Morning, Noon, Afternoon, or Evening, or an exact time. You get a notification then.
- **Keep reminding me**: turn it on and the notification repeats every 30 minutes until it's done (up to 6 times), so one swipe doesn't make you forget.
- **Snooze**: from the hold menu, from a missed reminder, or right from the pop-up when a reminder goes off.
- **Overdue**: one tap on "Move to today" reschedules everything overdue, with Undo.
- **App icon badge**: counts what's due today and overdue, not just one or the other.
- **Top right**: search, the bell (what Masha sent you and reminders that went off), and your settings.

## Logo files

`brand/` has the logo: `coconotes-logo.svg` (mark and wordmark), `coconotes-mark.svg` (mark only), and `coconotes-icon.svg` (app icon).
