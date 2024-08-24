import config from "./config.json";
import { Elysia, t } from "elysia";
import bodyType from "./types-github.ts";
import { Webhooks } from "@octokit/webhooks";

const webhooks = new Webhooks({
  secret: config?.secret ?? "",
});

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
  .onParse(async ({ request }) => {
    const contentType = request?.headers?.get("content-type");
    console.log({ contentType });
    if (contentType === "application/json; charset=utf-8") {
      console.log("application/json; charset=utf-8 ------>");
      const arrayBuffer = await Bun.readableStreamToArrayBuffer(request.body!);
      const rawBody = Buffer.from(arrayBuffer);
      return rawBody;
    }
  })
  .get(config.basePath + "/build-output", ({ set }) => {
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
    async ({ body, request, set }) => {
      const event = request.headers.get("x-github-event");
      const signature = request.headers.get("x-hub-signature");

      if (signature && config.secret) {
        if (!(await webhooks.verify(body.toString(), signature))) {
          set.status = 401;
          console.log("[github-webhooks] invalid signature, 401.");
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
