# n8n trigger bot

## Important Links

- [Terms of Service](./TERMS_OF_SERVICE.md)
- [Privacy Policy](./PRIVACY_POLICY.md)
- [Register for n8n](https://n8n.partnerlinks.io/emp0)
- [Bot Official Website](https://n8n-discord-trigger-bot.emp0.com)
- [Developed and mainted by: Emp0 Team](https://emp0.com)

---

A public, read-only Discord bot that lets you forward messages, reactions, and thread events from your Discord server to your own n8n, Zapier, Make.com, or custom webhook for powerful automations.

---

## 1. Add the Bot to Your Server

**[Invite Link](https://discord.com/oauth2/authorize?client_id=1389933424331980993):**
```
https://discord.com/oauth2/authorize?client_id=1389933424331980993
```
- The bot only requests minimal, read-only permissions:
  - Read Messages/View Channels
  - Read Message History
  - Use Slash Commands
- The bot cannot send messages, moderate, or manage your server.

---

## 2. Set Up a Channel to Forward Messages

1. Go to the channel you want to forward messages from.
2. Type the following slash command:
   ```
   /setup <webhook_url>
   ```
   - Example:
     ```
     /setup https://your-n8n-server.com/webhook/discord-channel-A
     ```
3. The bot will test your webhook and confirm setup if successful.
4. All new messages, reactions, and thread events in this channel will now be forwarded to your webhook.

- To remove a webhook from a channel:
  ```
  /remove
  ```
- To check the status:
  ```
  /status
  ```
- To list all webhooks in your server:
  ```
  /list
  ```

---

## 3. How to Handle Webhook Data in n8n, Zapier, Make.com, or Custom Server

### **n8n**
- Create a new **Webhook** node in n8n.
- Set the webhook URL to match what you used in `/setup`.
- The bot will POST a JSON payload to this URL for every event.
- You can now process the data in your n8n workflow (e.g., filter, store, send notifications, etc).

### **Zapier**
- Use the **Webhooks by Zapier** trigger.
- Set the trigger to "Catch Hook" and copy the custom webhook URL.
- Use this URL in `/setup`.
- Zapier will receive the JSON payload and you can build your automation.

### **Make.com**
- Use the **Webhooks** module to create a custom webhook.
- Copy the webhook URL and use it in `/setup`.
- Make.com will receive the JSON payload and you can build your scenario.

### **Custom Server**
- Set up an HTTP endpoint that accepts POST requests with JSON.
- Use the endpoint URL in `/setup`.
- Parse the JSON payload and process as needed.

---

## 4. Example Webhook JSON Payload

```
{
  "event_type": "message_create",
  "timestamp": 1640995200000,
  "content": {
    "text": "Hello, world!",
    "type": "message_create"
  },
  "author": {
    "id": "123456789012345678",
    "username": "username",
    "discriminator": "0000"
  },
  "channel": {
    "id": "123456789012345678",
    "name": "general",
    "type": 0
  },
  "guild": {
    "id": "123456789012345678",
    "name": "My Server"
  },
  "message_id": "123456789012345678",
  "timestamp": 1640995200000
}
```

---

## 5. Advanced/Deployment/Developer Info

For self-hosting, deployment, and advanced configuration, see the `/deployment/` folder in this repository.

---

## Contact Us

If you have questions, need support, or want to get in touch with the developers:
- **Email:** [tools@emp0.com](mailto:tools@emp0.com)
- **Discord:** @jym.god

---

**Disclaimer:** This project is not affiliated with, endorsed by, or sponsored by Discord or n8n. We are independent developers who created this tool to solve our own integration needs. 