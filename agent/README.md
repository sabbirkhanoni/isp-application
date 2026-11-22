# Router agent (optional)

Use it when your MikroTik router has **no public IP** (or you do not want to expose its API to the internet).
Run it on any always-on PC / Raspberry Pi / mini server **inside your network**. It only makes outgoing HTTPS
calls to the billing server, so no port has to be opened.

1. In the admin screen open **Routers → Add router**, choose **Agent**, save, and copy the token (shown once).
2. On the router enable the REST service and create an API user:
   `/ip service enable www-ssl` (needs a certificate) or `www` inside a trusted LAN, then a user in a group with `api`, `rest-api`, `read`, `write`, `policy` permissions.
3. On the agent computer (Node.js 18 or newer, no packages needed):

```
BACKEND_URL=https://your-api.onrender.com \
AGENT_TOKEN=<token from step 1> \
ROUTER_URL=https://192.168.88.1 \
ROUTER_USER=billing ROUTER_PASSWORD=*** \
ALLOW_SELF_SIGNED=true \
node router-agent.mjs
```

Keep it running (systemd service, `pm2`, or a scheduled task). If the agent is stopped, jobs simply wait and run when it returns.
