# Ember Discord Moderator

Ember is a Discord.js bot with a small, password-protected Express dashboard. Its first moderation feature is **channel control**: choose a text channel, optionally limit who can post by role, and decide which kinds of content can remain there.

When a controlled channel receives a disallowed message, Ember deletes it immediately and sends a short mention alert. The alert removes itself after 10 seconds.

## What channel control checks

| Control | Behaviour |
| --- | --- |
| Allowed roles | If one or more roles are selected, a member needs at least one of them to post. If no roles are selected, Ember leaves role access to Discord's normal channel permissions. |
| Images | Image attachments such as PNG, JPG, GIF, and WebP. |
| Videos | Video attachments such as MP4 and WebM. |
| Links | `http(s)` or `www.` links in a message. |
| Commands | Messages starting with `!` or `/`. |
| Text | Remaining written text after links/commands are ignored. |

If a message contains more than one type, every present type must be enabled. For example, an image with a caption needs both **Images** and **Text** enabled. Bot messages are ignored so that the alert itself is never moderated.

## Local setup

1. Install [Node.js 20 or later](https://nodejs.org/).
2. In this project directory, install dependencies:

   ```bash
   npm install
   ```

3. Open `.env` and fill in `DISCORD_TOKEN`. Replace the dashboard username and password too. `.env` is intentionally ignored by Git; `.env.example` documents all values.
4. Start the bot and dashboard:

   ```bash
   npm start
   ```

5. Open `http://localhost:3000` and sign in with `DASHBOARD_USERNAME` and `DASHBOARD_PASSWORD`.

## Create and link the Discord application

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications), choose **New Application**, give it a name, and create it.
2. Select **Bot** in the left navigation, then choose **Add Bot**. Under **Token**, choose **Reset Token** (if necessary), copy the token, and put it in `.env` as `DISCORD_TOKEN`. Treat this exactly like a password: never commit or share it.
3. Still on the Bot page, turn on **Message Content Intent** under *Privileged Gateway Intents*. Ember needs this to inspect normal message content. **Server Members Intent** is also used to reliably evaluate members' selected roles.
4. Copy the **Application ID** from **General Information** into `DISCORD_CLIENT_ID` in `.env` (and Render). Open **OAuth2 → URL Generator**, select `bot` and `applications.commands`, then select at least View Channels, Send Messages, Manage Messages, and Read Message History. Copy the generated URL, open it, choose your server, and authorize the bot. You need **Manage Server** permission. Once `DISCORD_CLIENT_ID` is set, the dashboard also has an **Install Ember to a server** link with those permissions preselected.
5. Ensure Ember's bot role is above roles whose messages it must delete. It also needs View Channel, Send Messages, and Manage Messages in every controlled channel.
6. Return to the dashboard, select the server, channel, roles (if applicable), and allowed content types, then choose **Enable channel control**.

### Apps in a server with 10,000+ users: privileged-intent review

Ember reads message text, links, and attachments, so it requires the **Message Content** privileged intent. It also requests **Guild Members** so it can reliably identify a message author's roles for the allowed-role rule. A server with more than 10,000 members can put the app over Discord's current 10,000 **unique users who can access the app** threshold, so plan for a privileged-intent review.

1. In the Developer Portal, open the application and go to **Bot → Privileged Gateway Intents**. Keep **Message Content Intent** and **Server Members Intent** enabled; do not enable Presence Intent, because Ember does not use it.
2. Watch the email and system DMs for the application/team owner, plus the Developer Portal banner. When the app reaches 10,000 accessible unique users, Discord prompts you to apply. You have 90 days from that notification to submit the privileged-intent request.
3. In the portal's privileged-intent review flow, describe only the actual need: Ember examines new messages in administrator-selected controlled channels to delete content types that are not allowed, and checks the posting member's selected Discord roles. State that it does not store message content or member profiles; the local settings file holds channel IDs, role IDs, and toggle choices only.
4. Submit the request while the current access is still active. Discord says the app can continue to grow and use its current privileged intents while the application is under review. Approved privileged-intent access is reviewed annually, so renew when Discord notifies you.

This is separate from **App Verification**, which is required when the app needs to grow beyond 100 servers. Complete the **App Verification** checklist in the Developer Portal when applicable; it includes identity verification for the owning developer/team. Discord's current guidance: [app verification](https://support-dev.discord.com/hc/en-us/articles/23926564536471-How-Do-I-Get-My-App-Verified) and [privileged-intent access](https://support-dev.discord.com/hc/en-us/articles/40281523410967-Changes-to-Privileged-Intent-Access-for-Discord-Apps).

## Deploy on Render

This project includes `render.yaml`, but you can deploy through Render's web UI too.

1. Push this repository to GitHub, GitLab, or Bitbucket. Do not push `.env`.
2. At [Render](https://render.com/), select **New → Blueprint** and connect the repository. Render reads `render.yaml` and creates a Node web service. Alternatively choose **New → Web Service**, select the repository, set build command to `npm ci`, and start command to `npm start`.
3. In the service's **Environment** settings, add these values: `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `DASHBOARD_USERNAME`, and `DASHBOARD_PASSWORD`. Do not add `PORT`; Render provides it automatically.
4. Deploy. Once live, use its `https://your-service.onrender.com/` URL to open the dashboard. Your browser will ask for dashboard credentials.
5. Check `https://your-service.onrender.com/health` to confirm the web process is healthy. `discordReady: true` means the bot has connected to Discord.

### Important Render persistence note

Channel settings are stored locally in `data/settings.json`. Render's standard filesystem is ephemeral, so settings can disappear after a redeploy or restart. For production, attach a Render Persistent Disk at the app's `data` directory (available on eligible paid services), or replace `src/store.js` with a hosted database such as Postgres. The bot must run continuously to moderate messages.

## Security and operational notes

- The dashboard uses HTTP Basic Auth. Set a strong, unique password and access it through Render's HTTPS URL.
- Keep the Discord token only in Render environment variables and your local ignored `.env` file.
- The dashboard lists servers currently cached by the connected bot. If it has just joined a server, refresh after Render logs show `Logged in as ...`.
- Disable a control from the **Active controls** list to restore normal message handling for that channel.

## Project layout

```text
src/index.js        Discord client and Express startup
src/dashboard.js    Password-protected dashboard and settings endpoints
src/moderation.js   Message classification and deletion logic
src/store.js        JSON-backed channel-control settings store
data/               Runtime settings (ignored by Git)
```
