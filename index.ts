import config from "./config.json";
import { Elysia, t } from "elysia";
import crypto from "crypto";
import bodyType from "./types-github.ts";

let buildInformation:
  | {
      repository: (typeof bodyType)["repository"]["full_name"];
      author: (typeof bodyType)["head_commit"]["author"];
      message: string;
      url: string;
      hash: string;
    }
  | undefined = undefined;
let allOut = "";
let proc: ReturnType<typeof Bun.spawn> | null = null;

new Elysia({
  serve: {
    hostname: config.hostname,
  },
})
  .get("/build-output", ({ set }) => {
    set.status = 200;
    set.headers = {
      "Content-Type": "text/plain",
    };

    if (allOut) {
      return JSON.stringify(buildInformation) + "\n\n\n" + allOut;
    }

    return "No output.";
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
        if (proc) {
          proc.kill(130); // 130 SIGINT
        }

        body.head_commit;
        buildInformation = {
          repository: body.repository.full_name,
          author: body.head_commit.author,
          message: body.head_commit.message,
          url: body.head_commit.url,
          hash: body.head_commit.id,
        };

        const commandAndArguments = configData[body.ref][event].exec;
        proc = Bun.spawn(commandAndArguments, {
          cwd: configData[body.ref][event].cwd,
        });

        const responseOut = new Response(proc.stdout);
        const responseErr = new Response(proc.stderr);

        allOut = "";

        responseOut
          .text()
          .then((text) => {
            const message = "[github-webhooks] " + text;
            console.log(message);
            allOut += message;
          })
          .finally(() => {
            proc = null;
          });
        responseErr
          .text()
          .then((text) => {
            const message = "[github-webhooks][error] " + text;
            console.error(message);
            allOut += message;
          })
          .finally(() => {
            proc = null;
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
