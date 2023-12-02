import config from "./config.json";
import { Elysia, t } from "elysia";
import crypto from "crypto";
import bodyType from "./types-github.ts";

new Elysia({
  serve: {
    hostname: config.hostname,
  },
})
  .post(
    config.basePath + "/",
    ({ body, request, set }) => {
      const event = request.headers.get("x-github-event");
      const signature = request.headers.get("x-hub-signature");

      if (signature && config.secret) {
        const hash = crypto
          .createHmac("sha1", config.secret)
          .update(signature)
          .digest("hex");

        if (signature !== `sha1=${hash}`) {
          set.status = 401;
          console.log("[github-webhooks] invalid signature detected, 401.");
          return "Invalid signature.";
        }
      }

      const configData:
        | {
            [branch: string]: {
              [event: string]: { exec: Array<string>; cwd: string };
            };
          }
        | undefined =
        config.refs[body.repository.full_name as keyof typeof config.refs];

      if (event && configData[body.ref] && configData[body.ref][event]) {
        const commandAndArguments = configData[body.ref][event].exec;
        const proc = Bun.spawnSync(commandAndArguments, {
          cwd: configData[body.ref][event].cwd,
        });

        const response = new Response(proc.stdout);
        response.text().then((text) => {
          console.log("[github-webhooks]", text);
        });

        set.status = 200;
        return "OK";
      } else {
        set.status = 404;
        console.log("[github-webhooks] repository not found, 404.");
        return "Repository not found.";
      }
    },
    {
      body: bodyType,
    }
  )
  .listen(config.port);

console.log(
  `[github-webhooks] listening on port ${config.hostname}:${config.port}...`
);
